/**
 * Портфель (0019): цены монет, балансы, цены входа, снимки стоимости + обновление балансов с бирж.
 * Балансы бирж тянет браузер через exchange-proxy (тот же ключ «только чтение», что для сделок) и пишет функцией
 * replace_holdings — база сама проверяет, что подключение своё и в пределах тарифа. Снимок — portfolio_snapshot (не чаще раза в час).
 * На Pro Plus то же самое делает сервер каждые 3 часа (sync-worker), даже когда сайт закрыт.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { cexCall, polymarketGet, useConnections, type Connection } from '@/features/connections/api'
import { useUsage } from '@/features/settings/api'
import { useIsAdmin } from '@/features/admin/api'
import { activeConnections } from '@/lib/plans'
import { errorCodeOf, toSyncError } from '@/lib/sync/run'
import { fetchBalances } from '@/lib/portfolio/balances'
import type { Coin, Holding, Snapshot } from '@/lib/calc/portfolio'

/** Балансы старше — обновить при открытии страницы */
export const PORTFOLIO_STALE_MS = 15 * 60_000

export function useCoins() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['coins'],
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coins')
        .select('id, symbol, name, rank, price, change_24h, change_7d, spark, icon')
        .order('rank', { ascending: true, nullsFirst: false })
        .limit(1000)
      if (error) throw error
      return (data ?? []) as Coin[]
    },
  })
}

export function useHoldings() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['holdings', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase.from('holdings').select('id, connection_id, account, symbol, amount, value_usd, note, updated_at').limit(1000)
      if (error) throw error
      return ((data ?? []) as Holding[]).map((h) => ({ ...h, amount: Number(h.amount), value_usd: h.value_usd === null ? null : Number(h.value_usd) }))
    },
  })
}

export function useCosts() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['asset_costs', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase.from('asset_costs').select('symbol, avg_price').limit(1000)
      if (error) throw error
      return Object.fromEntries(((data ?? []) as { symbol: string; avg_price: number }[]).map((r) => [r.symbol, Number(r.avg_price)])) as Record<string, number>
    },
  })
}

/** Снимки за последний год: пачками по 1000 (больше Supabase за раз не отдаёт) */
export function useSnapshots() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['portfolio_snapshots', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const since = new Date(Date.now() - 366 * 86_400_000).toISOString()
      const out: Snapshot[] = []
      for (let from = 0; from < 20_000; from += 1000) {
        const { data, error } = await supabase
          .from('portfolio_snapshots')
          .select('at, total_usd, btc_price')
          .gte('at', since)
          .order('at')
          .range(from, from + 999)
        if (error) throw error
        out.push(...((data ?? []) as Snapshot[]))
        if (!data || data.length < 1000) break
      }
      return out
    },
  })
}

/** Публичный адрес иконки монеты в нашем Storage (bucket coin-icons) */
export function coinIconUrl(icon: string | null): string | null {
  return icon ? supabase.storage.from('coin-icons').getPublicUrl(icon).data.publicUrl : null
}

// ---------- обновление балансов ----------
let refreshing: Promise<RefreshResult> | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
/** Идёт ли сейчас обновление балансов (для кнопки и мерцающего текста) */
export function useRefreshing(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => refreshing !== null,
  )
}

export type RefreshResult = { ok: number; failed: { id: string; code: string }[] }

/** Подключения, с которых можно тянуть балансы: в пределах тарифа и с рабочим ключом */
export function portfolioConnections(conns: Connection[], plan: Parameters<typeof activeConnections>[1], admin: boolean): Connection[] {
  const active = activeConnections(conns, plan, admin)
  return conns.filter((c) => active.has(c.id) && !(errorCodeOf(c.last_error) ?? '').startsWith('KEY_'))
}

/** Балансы всех подходящих подключений → база; потом снимок стоимости. Одно обновление за раз */
export function refreshPortfolio(conns: Connection[]): Promise<RefreshResult> {
  if (refreshing) return refreshing
  refreshing = (async () => {
    const res: RefreshResult = { ok: 0, failed: [] }
    for (const c of conns) {
      try {
        const items = await fetchBalances(c, { cexCall: cexCall(c.id), polymarketGet: polymarketGet(c.id) })
        const { error } = await supabase.rpc('replace_holdings', { p_connection: c.id, p_items: items })
        if (error) throw error
        res.ok++
      } catch (e) {
        // старые балансы остаются — график не «падает»; код ошибки покажем у подключения
        res.failed.push({ id: c.id, code: toSyncError(e).code })
      }
    }
    await supabase.rpc('portfolio_snapshot')
    return res
  })().finally(() => {
    refreshing = null
    emit()
  })
  emit()
  return refreshing
}

function invalidatePortfolio(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['holdings'] })
  qc.invalidateQueries({ queryKey: ['portfolio_snapshots'] })
}

/** Подключения для портфеля с учётом тарифа */
export function usePortfolioConnections(): { conns: Connection[]; all: Connection[]; ready: boolean } {
  const { data: all = [], isSuccess } = useConnections()
  const { data: usage } = useUsage()
  const { data: isAdmin } = useIsAdmin()
  return { conns: usage ? portfolioConnections(all, usage.plan, Boolean(isAdmin)) : [], all, ready: isSuccess && Boolean(usage) }
}

export function useRefreshPortfolio() {
  const qc = useQueryClient()
  const { conns } = usePortfolioConnections()
  return useMutation({
    mutationFn: () => refreshPortfolio(conns),
    onSettled: () => invalidatePortfolio(qc),
  })
}

/** Открыли «Портфель»: балансы старше 15 минут (или их ещё нет) — обновить один раз сами */
export function useAutoRefreshPortfolio(holdings: Holding[] | undefined) {
  const qc = useQueryClient()
  const { conns, ready } = usePortfolioConnections()
  const done = useRef(false)
  useEffect(() => {
    if (done.current || !ready || !holdings || !conns.length) return
    const stale = conns.some((c) => {
      const mine = holdings.filter((h) => h.connection_id === c.id)
      const newest = Math.max(0, ...mine.map((h) => Date.parse(h.updated_at)))
      return !mine.length || Date.now() - newest > PORTFOLIO_STALE_MS
    })
    done.current = true
    if (!stale) {
      // балансы свежие — только снимок (база сама пропустит, если он был меньше часа назад)
      void supabase.rpc('portfolio_snapshot').then(() => qc.invalidateQueries({ queryKey: ['portfolio_snapshots'] }))
      return
    }
    void refreshPortfolio(conns).finally(() => invalidatePortfolio(qc))
  }, [ready, holdings, conns, qc])
}

// ---------- монеты вручную и цены входа ----------
export function useAddManual() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { symbol: string; amount: number; note?: string | null }) => {
      const { error } = await supabase.from('holdings').insert({ account: 'manual', symbol: v.symbol, amount: v.amount, note: v.note || null })
      if (error) throw error
      await supabase.rpc('portfolio_snapshot')
    },
    onSuccess: () => invalidatePortfolio(qc),
  })
}

export function useUpdateManual() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; amount: number }) => {
      const { error } = await supabase.from('holdings').update({ amount: v.amount }).eq('id', v.id)
      if (error) throw error
    },
    onSuccess: () => invalidatePortfolio(qc),
  })
}

export function useDeleteManual() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('holdings').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidatePortfolio(qc),
  })
}

/** Цена входа по монете: число — сохранить, null — убрать */
export function useSetCost() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (v: { symbol: string; avgPrice: number | null }) => {
      const { error } =
        v.avgPrice === null
          ? await supabase.from('asset_costs').delete().eq('symbol', v.symbol)
          : await supabase.from('asset_costs').upsert({ user_id: user!.id, symbol: v.symbol, avg_price: v.avgPrice }, { onConflict: 'user_id,symbol' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['asset_costs'] }),
  })
}
