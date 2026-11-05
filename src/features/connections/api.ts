/**
 * Подключения бирж (как у TradeZella): сделки подтягиваются сами.
 *  - Bybit: ключ API «только чтение»; запросы подписывает серверная функция exchange-proxy (секрет в браузер не попадает).
 *  - Hyperliquid: только адрес кошелька; история открыта, запросы идут напрямую в api.hyperliquid.xyz.
 * Найденные сделки проходят тот же путь, что импорт файла: проверка дублей → лимит Free → запись в «Историю импортов».
 */
import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FunctionRegion } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { planImport } from '@/lib/import/plan'
import type { ImportedTrade, ParsedRow } from '@/lib/import/types'
import { BYBIT_HISTORY_DAYS, BybitError, DAY, checkBybitKey, fetchBybitTrades, type BybitCall, type BybitResponse } from '@/lib/sync/bybit'
import { fetchHlFills, hlFillsToTrades } from '@/lib/sync/hyperliquid'
import { fetchExistingIds, runImport } from '@/features/import/api'

export type Connection = {
  id: string
  exchange: string
  label: string | null
  api_key: string
  last_sync_at: string | null
  cursor_at: string | null
  last_error: string | null
  created_at: string
}

/** Биржи, которые умеем подключать: cex — ключ API, wallet — адрес кошелька */
export const CONNECTABLE = [
  { id: 'bybit', kind: 'cex' },
  { id: 'hyperliquid', kind: 'wallet' },
] as const
export type ConnectableId = (typeof CONNECTABLE)[number]['id']

/** Как часто подтягивать сами, пока сайт открыт */
export const AUTO_SYNC_MS = 15 * 60_000

export function useConnections() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['connections', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exchange_connections')
        .select('id, exchange, label, api_key, last_sync_at, cursor_at, last_error, created_at')
        .order('created_at')
      if (error) throw error
      return data as Connection[]
    },
  })
}

/** Ошибка подключения / синхронизации — код для текста в i18n (connections.errors) */
export class SyncError extends Error {
  constructor(
    public code: string,
    public detail = '',
  ) {
    super(code)
  }
}

/** Запрос к Bybit через серверную функцию (подпись ключом пользователя) */
function bybitCall(connectionId: string): BybitCall {
  return async (path, params) => {
    const { data, error } = await supabase.functions.invoke('exchange-proxy', {
      body: { connectionId, path, params },
      region: FunctionRegion.EuCentral1, // Bybit не работает из США: запросы — из Франкфурта
    })
    if (error) {
      // у ошибки функции тело с кодом (NOT_ALLOWED, EXCHANGE_HTTP…)
      let code = 'PROXY'
      try {
        const body = await (error as { context?: Response }).context?.json()
        if (body?.error) code = String(body.error)
      } catch {
        /* тело не JSON */
      }
      throw new SyncError(code === 'EXCHANGE_HTTP' ? 'EXCHANGE_DOWN' : 'PROXY', code)
    }
    return data as BybitResponse<unknown>
  }
}

/** Ошибки Bybit, понятные человеку */
function bybitErrorCode(e: BybitError): string {
  if ([10003, 10004, 33004].includes(e.code)) return 'KEY_INVALID'
  if (e.code === 10005) return 'KEY_NO_PERMISSION'
  if (e.code === 10010) return 'KEY_IP'
  if (e.code === 10006 || e.code === 10018) return 'RATE_LIMIT'
  return 'EXCHANGE'
}

function toSyncError(e: unknown): SyncError {
  if (e instanceof SyncError) return e
  if (e instanceof BybitError) return new SyncError(bybitErrorCode(e), `${e.code}: ${e.message}`)
  const msg = e instanceof Error ? e.message : String(e)
  if (/HL_HTTP|fetch|network/i.test(msg)) return new SyncError('EXCHANGE_DOWN', msg)
  return new SyncError('UNKNOWN', msg)
}

export type SyncResult = { found: number; inserted: number; overLimit: number }

/** Синхронизации, которые идут прямо сейчас: одно подключение не качаем дважды (кнопка + авто) */
const inFlight = new Map<string, Promise<SyncResult>>()

/** Скачать новые сделки подключения и записать их (дубли и лимит — как при импорте файла) */
export function syncConnection(conn: Connection, remaining: () => Promise<number | null>): Promise<SyncResult> {
  const running = inFlight.get(conn.id)
  if (running) return running
  const p = doSync(conn, remaining).finally(() => inFlight.delete(conn.id))
  inFlight.set(conn.id, p)
  return p
}

async function doSync(conn: Connection, remainingFn: () => Promise<number | null>): Promise<SyncResult> {
  try {
    let trades: ImportedTrade[]
    let nextCursor: number | null
    if (conn.exchange === 'bybit') {
      const now = Date.now()
      // с запасом в 2 дня: Bybit может отдать закрытие чуть позже, дубли всё равно отсеются
      const from = conn.cursor_at ? Date.parse(conn.cursor_at) - 2 * DAY : now - BYBIT_HISTORY_DAYS * DAY
      trades = await fetchBybitTrades(bybitCall(conn.id), from, now)
      nextCursor = now
    } else if (conn.exchange === 'hyperliquid') {
      const from = conn.cursor_at ? Date.parse(conn.cursor_at) : 0
      const res = hlFillsToTrades(await fetchHlFills(conn.api_key, from))
      trades = res.trades
      nextCursor = res.cursor
    } else {
      throw new SyncError('UNSUPPORTED')
    }

    const existing = await fetchExistingIds(conn.exchange, trades.map((t) => t.external_id))
    const rows: ParsedRow[] = trades.map((trade, i) => ({ line: i + 2, trade, error: null, warnings: [] }))
    const plan = planImport(rows, existing, await remainingFn())
    let inserted = 0
    if (plan.toInsert.length) {
      const res = await runImport({
        exchange: conn.exchange,
        filename: `API · ${conn.label ?? shortKey(conn.api_key)}`,
        rowsTotal: plan.toInsert.length,
        trades: plan.toInsert,
        source: 'api',
      })
      inserted = res.inserted
      if (res.error) throw res.error
    }
    // не всё влезло в лимит Free — курсор не двигаем: остальное подтянется в следующем месяце
    const cursor = plan.counts.overLimit > 0 ? null : nextCursor
    await supabase.rpc('touch_exchange_connection', { p_id: conn.id, p_cursor: cursor === null ? null : new Date(cursor).toISOString(), p_error: null })
    return { found: trades.length, inserted, overLimit: plan.counts.overLimit }
  } catch (e) {
    const err = e && typeof e === 'object' && 'message' in e && String((e as Error).message).includes('FREE_LIMIT_REACHED') ? new SyncError('FREE_LIMIT') : toSyncError(e)
    await supabase.rpc('touch_exchange_connection', { p_id: conn.id, p_cursor: null, p_error: `${err.code}${err.detail ? ` | ${err.detail}` : ''}`.slice(0, 500) })
    throw err
  }
}

/** Код ошибки из last_error («KEY_INVALID | 10003: …») */
export const errorCodeOf = (lastError: string | null) => (lastError ? lastError.split(' | ')[0] : null)

/** 0x1234…abcd / ключ: первые и последние символы */
export const shortKey = (key: string) => (key.length > 12 ? `${key.slice(0, 6)}…${key.slice(-4)}` : key)

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['connections'] })
  qc.invalidateQueries({ queryKey: ['trades'] })
  qc.invalidateQueries({ queryKey: ['usage'] })
  qc.invalidateQueries({ queryKey: ['imports'] })
}

async function remainingTrades(): Promise<number | null> {
  const { data } = await supabase.rpc('get_my_usage').single()
  const u = data as { trades_created: number; trade_limit: number | null } | null
  return u && u.trade_limit !== null ? Math.max(0, u.trade_limit - u.trades_created) : null
}

/** Подключить биржу. Bybit: сразу проверяем, что ключ только для чтения, иначе удаляем его */
export function useAddConnection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { exchange: ConnectableId; apiKey: string; secret?: string; label?: string }) => {
      const { data: id, error } = await supabase.rpc('add_exchange_connection', {
        p_exchange: args.exchange,
        p_api_key: args.apiKey.trim(),
        p_secret: args.secret?.trim() || null,
        p_label: args.label?.trim() || null,
      })
      if (error) throw error
      const connId = id as string
      if (args.exchange === 'bybit') {
        try {
          const info = await checkBybitKey(bybitCall(connId))
          if (!info.readOnly) throw new SyncError('KEY_NOT_READONLY')
        } catch (e) {
          await supabase.rpc('delete_exchange_connection', { p_id: connId })
          throw toSyncError(e)
        }
      }
      return connId
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['connections'] }),
  })
}

export function useDeleteConnection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('delete_exchange_connection', { p_id: id })
      if (error) throw error
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['connections'] }),
  })
}

export function useSyncConnection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (conn: Connection) => syncConnection(conn, remainingTrades),
    onSettled: () => invalidateAll(qc),
  })
}

/**
 * Автосинхронизация: при открытии сайта и каждые 15 минут, пока он открыт.
 * Подключения, которые недавно синхронизировались или сломаны (ключ отозван), не трогаем.
 */
export function useAutoSync() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const { data: conns } = useConnections()
  const running = useRef(false)

  useEffect(() => {
    if (!user || !conns?.length) return
    const tick = async () => {
      if (running.current || document.visibilityState === 'hidden') return
      const due = conns.filter((c) => {
        const code = errorCodeOf(c.last_error)
        if (code && code.startsWith('KEY_')) return false // сломанный ключ — ждём, пока человек поправит
        return !c.last_sync_at || Date.now() - Date.parse(c.last_sync_at) > AUTO_SYNC_MS
      })
      if (!due.length) return
      running.current = true
      let changed = false
      try {
        for (const c of due) {
          try {
            const r = await syncConnection(c, remainingTrades)
            changed ||= r.inserted > 0
          } catch {
            /* ошибка сохранена в подключении — покажем на странице импорта */
          }
        }
      } finally {
        running.current = false
        if (changed) invalidateAll(qc)
        else qc.invalidateQueries({ queryKey: ['connections'] })
      }
    }
    void tick()
    const id = window.setInterval(() => void tick(), 60_000)
    return () => window.clearInterval(id)
  }, [user, conns, qc])
}
