/**
 * Подключения бирж (как у TradeZella): сделки подтягиваются сами.
 *  - Bybit: ключ API «только чтение»; запросы подписывает серверная функция exchange-proxy (секрет в браузер не попадает).
 *  - Hyperliquid: только адрес кошелька; история открыта, запросы идут напрямую в api.hyperliquid.xyz.
 *  - Polymarket: только адрес кошелька; закрытые позиции через exchange-proxy (без ключей).
 * Найденные сделки проходят тот же путь, что импорт файла: проверка дублей → лимит Free → запись в «Историю импортов».
 */
import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FunctionRegion } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { checkBybitKey, type BybitCall, type BybitResponse } from '@/lib/sync/bybit'
import { pmPositionToTrade, type PmGet } from '@/lib/sync/polymarket'
import { SyncError, errorCodeOf, runSync, toSyncError, type SyncResult } from '@/lib/sync/run'
import { fetchExistingIds, runImport } from '@/features/import/api'
import { useUsage } from '@/features/settings/api'
import { activeConnections } from '@/lib/plans'
import { useIsAdmin } from '@/features/admin/api'
import { markSynced } from '@/lib/arrivals'

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
  { id: 'hyperliquid', kind: 'wallet' },
  { id: 'polymarket', kind: 'wallet' },
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
        .select('id, exchange, label, api_key, last_sync_at, cursor_at, last_error, key_expires_at, created_at')
        .order('created_at')
      if (error) throw error
      return data as Connection[]
    },
  })
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
      throw new SyncError(code === 'EXCHANGE_HTTP' ? 'EXCHANGE_DOWN' : code === 'PLAN_REQUIRED' ? 'PLAN_REQUIRED' : 'PROXY', code)
    }
    return data as BybitResponse<unknown>
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

/** Синхронизация из браузера — с правами пользователя (RLS + 2FA) */
export function syncConnection(conn: Connection, remaining: () => Promise<number | null>): Promise<SyncResult> {
  const running = inFlight.get(conn.id)
  if (running) return running
  const p = runSync(conn, {
    bybitCall: bybitCall(conn.id),
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
  }).finally(() => inFlight.delete(conn.id))
  inFlight.set(conn.id, p)
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
          await supabase.rpc('set_connection_key_expiry', { p_id: connId, p_expires: info.expiresAt })
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
