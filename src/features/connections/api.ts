/**
 * Подключения бирж (как у TradeZella): сделки подтягиваются сами.
 *  - Bybit, Binance, OKX, BingX, Bitget: ключ API «только чтение» (у OKX и Bitget — с кодовой фразой);
 *    запросы подписывает серверная функция exchange-proxy (секрет в браузер не попадает).
 *  - Hyperliquid: только адрес кошелька; история открыта, запросы идут напрямую в api.hyperliquid.xyz.
 *  - Polymarket: только адрес кошелька; закрытые позиции через exchange-proxy (без ключей).
 * Найденные сделки проходят тот же путь, что импорт файла: проверка дублей → лимит Free → запись в «Историю импортов».
 */
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FunctionRegion } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { checkBybitKey, type BybitCall } from '@/lib/sync/bybit'
import type { CexCall } from '@/lib/sync/cex'
import { pmPositionToTrade, type PmGet } from '@/lib/sync/polymarket'
import { CEX_MODULES, SyncError, errorCodeOf, runSync, toSyncError, type SyncResult } from '@/lib/sync/run'
import { fetchExistingIds, runImport } from '@/features/import/api'
import { useUsage } from '@/features/settings/api'
import { activeConnections } from '@/lib/plans'
import { useIsAdmin } from '@/features/admin/api'
import { markSynced } from '@/lib/arrivals'
import { finishActivity, startActivity } from '@/lib/activity'
import { exchangeName } from '@/lib/exchanges'

export { SyncError, errorCodeOf, shortKey, type SyncResult } from '@/lib/sync/run'

export type Connection = {
  id: string
  exchange: string
  label: string | null
  api_key: string
  last_sync_at: string | null
  cursor_at: string | null
  last_error: string | null
  /** когда истекает ключ (Bybit без привязки к IP — через 90 дней) */
  key_expires_at: string | null
  created_at: string
}

/** Биржи, которые умеем подключать: cex — ключ API, wallet — адрес кошелька */
export const CONNECTABLE = [
  { id: 'bybit', kind: 'cex' },
  { id: 'binance', kind: 'cex' },
  { id: 'okx', kind: 'cex' },
  { id: 'bingx', kind: 'cex' },
  { id: 'bitget', kind: 'cex' },
  { id: 'hyperliquid', kind: 'wallet' },
  { id: 'polymarket', kind: 'wallet' },
] as const
export type ConnectableId = (typeof CONNECTABLE)[number]['id']

/** Биржи, у ключа которых есть кодовая фраза (Passphrase) — как и в базе (add_exchange_connection, 0018) */
export const NEEDS_PASSPHRASE: ReadonlySet<string> = new Set(['okx', 'bitget'])

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
        .select('id, exchange, label, api_key, last_sync_at, cursor_at, last_error, key_expires_at, created_at')
        .order('created_at')
      if (error) throw error
      return data as Connection[]
    },
  })
}

/** Запрос к бирже через серверную функцию (подпись ключом пользователя; только адреса для чтения) */
function cexCall(connectionId: string): CexCall {
  return async (path, params) => {
    const { data, error } = await supabase.functions.invoke('exchange-proxy', {
      body: { connectionId, path, params },
      region: FunctionRegion.EuCentral1, // Bybit и Binance не работают из США: запросы — из Франкфурта
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
      throw new SyncError(code === 'EXCHANGE_HTTP' ? 'EXCHANGE_DOWN' : code === 'PLAN_REQUIRED' ? 'PLAN_REQUIRED' : 'PROXY', code)
    }
    return data
  }
}

/** Polymarket Data API через серверную функцию (у Polymarket нет разрешения на запросы со сторонних сайтов) */
function polymarketGet(connectionId: string): PmGet {
  return async (path, params) => {
    const { data, error } = await supabase.functions.invoke('exchange-proxy', { body: { connectionId, path, params } })
    if (error) throw new SyncError('EXCHANGE_DOWN', 'PROXY')
    return data
  }
}

/** Демо Polymarket: закрытые позиции публичного кошелька → сделки (в дневник не пишутся) */
export function usePolymarketDemo(enabled: boolean) {
  return useQuery({
    queryKey: ['polymarketDemo'],
    enabled,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('exchange-proxy', { body: { demo: true, path: '/v2/positions' } })
      if (error) throw new SyncError('EXCHANGE_DOWN', 'PROXY')
      const items = Array.isArray(data) ? data : ((data as { data?: unknown[] })?.data ?? [])
      return (items as Record<string, unknown>[]).flatMap((p) => {
        const t = pmPositionToTrade(p)
        return t ? [t] : []
      })
    },
  })
}

/** Синхронизации, которые идут прямо сейчас: одно подключение не качаем дважды (кнопка + авто) */
const inFlight = new Map<string, Promise<SyncResult>>()
const syncListeners = new Set<() => void>()
const emitSyncing = () => syncListeners.forEach((l) => l())
const subscribeSyncing = (cb: () => void) => {
  syncListeners.add(cb)
  return () => void syncListeners.delete(cb)
}

/** Идёт ли синхронизация этого подключения прямо сейчас (кнопка «Обновить», первая после подключения или автосинхронизация) */
export function useSyncing(id: string): boolean {
  return useSyncExternalStore(subscribeSyncing, () => inFlight.has(id))
}

/**
 * Синхронизация из браузера — с правами пользователя (RLS + 2FA).
 * announce — показать в окошке фоновых загрузок (кнопка «Обновить» и первая после подключения; автосинхронизация — тихо)
 */
export function syncConnection(conn: Connection, remaining: () => Promise<number | null>, announce = false): Promise<SyncResult> {
  const activityId = `sync:${conn.id}`
  const show = () => announce && startActivity({ id: activityId, kind: 'sync', label: [exchangeName(conn.exchange, ''), conn.label].filter(Boolean).join(' · ') })
  const running = inFlight.get(conn.id)
  if (running) {
    // уже качается (например, автосинхронизация успела начать первой) — показываем в окошке ту же загрузку
    if (announce) {
      show()
      running.then(
        (r) => finishActivity(activityId, { inserted: r.inserted }),
        () => finishActivity(activityId, { error: true }),
      )
    }
    return running
  }
  show()
  const p = runSync(conn, {
    cexCall: cexCall(conn.id),
    polymarketGet: polymarketGet(conn.id),
    existingIds: fetchExistingIds,
    remaining,
    insert: ({ exchange, filename, trades }) => runImport({ exchange, filename, rowsTotal: trades.length, trades, source: 'api' }),
    touch: async (cursor, error) => {
      await supabase.rpc('touch_exchange_connection', { p_id: conn.id, p_cursor: cursor, p_error: error })
    },
    setKeyExpiry: async (iso) => {
      await supabase.rpc('set_connection_key_expiry', { p_id: conn.id, p_expires: iso })
    },
  })
    .then(
      (r) => {
        if (announce) finishActivity(activityId, { inserted: r.inserted })
        return r
      },
      (e) => {
        if (announce) finishActivity(activityId, { error: true })
        throw e
      },
    )
    .finally(() => {
      inFlight.delete(conn.id)
      emitSyncing()
    })
  inFlight.set(conn.id, p)
  emitSyncing()
  return p
}

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

/** Подключить биржу. Ключ API: сразу проверяем у биржи, что он рабочий и только для чтения, иначе удаляем подключение */
export function useAddConnection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      exchange: ConnectableId
      apiKey: string
      secret?: string
      passphrase?: string
      label?: string
      /** шаги для анимации «мост»: ключ сохранён → права проверены (только чтение) */
      onStage?: (stage: 'added' | 'checked') => void
    }) => {
      const { data: id, error } = await supabase.rpc('add_exchange_connection', {
        p_exchange: args.exchange,
        p_api_key: args.apiKey.trim(),
        p_secret: args.secret?.trim() || null,
        p_label: args.label?.trim() || null,
        // кодовую фразу не обрезаем: пробелы по краям могут быть её частью
        ...(NEEDS_PASSPHRASE.has(args.exchange) ? { p_passphrase: args.passphrase || null } : {}),
      })
      if (error) throw error
      const connId = id as string
      args.onStage?.('added')
      const mod = CEX_MODULES[args.exchange]
      if (args.exchange === 'bybit' || mod) {
        try {
          const call = cexCall(connId)
          const info = mod ? await mod.check(call) : await checkBybitKey(call as BybitCall)
          if (!info.readOnly) throw new SyncError('KEY_NOT_READONLY')
          if (info.expiresAt !== undefined) await supabase.rpc('set_connection_key_expiry', { p_id: connId, p_expires: info.expiresAt })
        } catch (e) {
          await supabase.rpc('delete_exchange_connection', { p_id: connId })
          throw toSyncError(e)
        }
      }
      args.onStage?.('checked')
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
    mutationFn: (conn: Connection) => syncConnection(conn, remainingTrades, true),
    onSuccess: (r) => {
      if (r.inserted > 0) markSynced()
    },
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
  const { data: usage } = useUsage()
  const { data: isAdmin } = useIsAdmin()
  const plan = usage?.plan
  const running = useRef(false)

  useEffect(() => {
    if (!user || !conns?.length || !plan) return
    const tick = async () => {
      if (running.current || document.visibilityState === 'hidden') return
      const active = activeConnections(conns, plan, Boolean(isAdmin))
      const due = conns.filter((c) => {
        const code = errorCodeOf(c.last_error)
        if (code && code.startsWith('KEY_')) return false // сломанный ключ — ждём, пока человек поправит
        if (!active.has(c.id)) return false // не по тарифу (Polymarket на Pro, сверх лимита, тариф закончился) — на паузе
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
        if (changed) {
          markSynced() // №12: новые сделки в списке раздвинут его и вспыхнут
          invalidateAll(qc)
        }
        else qc.invalidateQueries({ queryKey: ['connections'] })
      }
    }
    void tick()
    const id = window.setInterval(() => void tick(), 60_000)
    return () => window.clearInterval(id)
  }, [user, conns, qc, plan, isAdmin])
}
