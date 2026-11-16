/**
 * Портфель: балансы подключённой биржи / кошелька → строки holdings (0019).
 * Общий код для браузера (через exchange-proxy) и сервера (sync-worker, Pro Plus): запросы приходят снаружи (deps).
 *
 * Правила (дыры №5 и №6 из плана, 16.11.2026):
 *  - складываем все счета биржи (спот, фандинг, фьючерсы, Earn), но не задваиваем: у Binance активы «LD…» в споте —
 *    это Simple Earn, их берём из Earn; фьючерсный счёт — по equity (с нереализованным PnL), позиции отдельно не считаем;
 *  - основной счёт не ответил — ошибка (старые балансы остаются, график не «падает»); дополнительный (Earn, фьючерсы) не ответил —
 *    просто без него;
 *  - символы — заглавными, только буквы / цифры; нули и отрицательные (заём) отбрасываем.
 */
import { BybitError, type BybitCall } from '@/lib/sync/bybit'
import { binanceGet } from '@/lib/sync/binance'
import { okxGet } from '@/lib/sync/okx'
import { bingxGet } from '@/lib/sync/bingx'
import { bitgetGet } from '@/lib/sync/bitget'
import { HL_API } from '@/lib/sync/hyperliquid'
import { pmDirectGet, type PmGet } from '@/lib/sync/polymarket'
import type { CexCall } from '@/lib/sync/cex'

export type HoldingAccount = 'spot' | 'fund' | 'futures' | 'earn' | 'perp' | 'prediction'
export type Balance = { account: HoldingAccount; symbol: string; amount: number; value_usd?: number | null }

export type BalanceDeps = {
  cexCall: CexCall
  fetchFn?: typeof fetch
  polymarketGet?: PmGet
}

type Obj = Record<string, unknown>
const n = (v: unknown): number => {
  const x = typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : NaN
  return Number.isFinite(x) ? x : 0
}
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : [])

/** Обёртки Hyperliquid (UBTC, UETH…) — это те же монеты */
const ALIASES: Record<string, string> = { UBTC: 'BTC', UETH: 'ETH', USOL: 'SOL', USDT0: 'USDT' }

/** Символ биржи → наш (BTC); мусор — null */
export function cleanSymbol(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim().toUpperCase()
  const out = ALIASES[s] ?? s
  return /^[A-Z0-9._-]{1,24}$/.test(out) ? out : null
}

/** Одинаковые (счёт, монета) — в одну строку; нули и заём — прочь */
export function mergeBalances(list: Balance[]): Balance[] {
  const map = new Map<string, Balance>()
  for (const b of list) {
    const symbol = cleanSymbol(b.symbol)
    if (!symbol) continue
    const key = `${b.account}|${symbol}`
    const prev = map.get(key)
    if (prev) {
      prev.amount += b.amount
      if (b.value_usd != null) prev.value_usd = (prev.value_usd ?? 0) + b.value_usd
    } else map.set(key, { ...b, symbol })
  }
  return [...map.values()].filter((b) => b.amount > 1e-12 || (b.value_usd ?? 0) > 0)
}

/** Дополнительный счёт: ошибка — пусто (основной уже ответил) */
async function optional(fn: () => Promise<Balance[]>): Promise<Balance[]> {
  try {
    return await fn()
  } catch {
    return []
  }
}

// ---------- Bybit ----------
async function bybitResult<T>(call: BybitCall, path: string, params: Record<string, string | number>): Promise<T> {
  const r = await call(path, params)
  if (!r || r.retCode !== 0) throw new BybitError(r?.retCode ?? -1, r?.retMsg ?? 'no response')
  return r.result as T
}

export async function bybitBalances(call: CexCall): Promise<Balance[]> {
  const c = call as BybitCall
  // единый торговый счёт: спот + фьючерсы, equity по монете уже с нереализованным PnL
  const unified = await bybitResult<{ list?: Obj[] }>(c, '/v5/account/wallet-balance', { accountType: 'UNIFIED' })
  const out: Balance[] = arr(unified.list?.[0]?.coin).map((x) => ({ account: 'spot', symbol: String(x.coin), amount: n(x.equity ?? x.walletBalance) }))
  out.push(
    ...(await optional(async () => {
      const fund = await bybitResult<{ balance?: Obj[] }>(c, '/v5/asset/transfer/query-account-coins-balance', { accountType: 'FUND' })
      return arr(fund.balance).map((x) => ({ account: 'fund' as const, symbol: String(x.coin), amount: n(x.walletBalance) }))
    })),
  )
  for (const category of ['FlexibleSaving', 'OnChain']) {
    out.push(
      ...(await optional(async () => {
        const earn = await bybitResult<{ list?: Obj[] }>(c, '/v5/earn/position', { category })
        return arr(earn.list).map((x) => ({ account: 'earn' as const, symbol: String(x.coin), amount: n(x.amount) }))
      })),
    )
  }
  return mergeBalances(out)
}

// ---------- Binance ----------
export async function binanceBalances(call: CexCall): Promise<Balance[]> {
  const spot = await binanceGet<{ balances?: Obj[] }>(call, '/api/v3/account', { omitZeroBalances: 'true' })
  // LDBTC, LDUSDT… — это Simple Earn (Flexible), их считаем ниже из Earn, иначе задвоим
  const out: Balance[] = arr(spot.balances)
    .filter((x) => !/^LD[A-Z0-9]{2,}$/.test(String(x.asset)))
    .map((x) => ({ account: 'spot', symbol: String(x.asset), amount: n(x.free) + n(x.locked) }))
  out.push(
    ...(await optional(async () =>
      arr(await binanceGet<unknown>(call, '/sapi/v1/asset/get-funding-asset', {})).map((x) => ({
        account: 'fund' as const,
        symbol: String(x.asset),
        amount: n(x.free) + n(x.locked) + n(x.freeze) + n(x.withdrawing),
      })),
    )),
    ...(await optional(async () =>
      arr(await binanceGet<unknown>(call, '/fapi/v2/balance', {})).map((x) => ({
        account: 'futures' as const,
        symbol: String(x.asset),
        amount: n(x.balance) + n(x.crossUnPnl),
      })),
    )),
    ...(await optional(async () =>
      arr((await binanceGet<{ rows?: unknown }>(call, '/sapi/v1/simple-earn/flexible/position', { size: 100 })).rows).map((x) => ({
        account: 'earn' as const,
        symbol: String(x.asset),
        amount: n(x.totalAmount),
      })),
    )),
    ...(await optional(async () =>
      arr((await binanceGet<{ rows?: unknown }>(call, '/sapi/v1/simple-earn/locked/position', { size: 100 })).rows).map((x) => ({
        account: 'earn' as const,
        symbol: String(x.asset),
        amount: n(x.amount),
      })),
    )),
  )
  return mergeBalances(out)
}

// ---------- OKX ----------
export async function okxBalances(call: CexCall): Promise<Balance[]> {
  const trading = await okxGet<Obj>(call, '/api/v5/account/balance', {})
  const out: Balance[] = arr(trading[0]?.details).map((x) => ({ account: 'spot', symbol: String(x.ccy), amount: n(x.eq) }))
  out.push(
    ...(await optional(async () => (await okxGet<Obj>(call, '/api/v5/asset/balances', {})).map((x) => ({ account: 'fund' as const, symbol: String(x.ccy), amount: n(x.bal) })))),
    ...(await optional(async () =>
      (await okxGet<Obj>(call, '/api/v5/finance/savings/balance', {})).map((x) => ({ account: 'earn' as const, symbol: String(x.ccy), amount: n(x.amt) })),
    )),
  )
  return mergeBalances(out)
}

// ---------- Bitget ----------
export async function bitgetBalances(call: CexCall): Promise<Balance[]> {
  // единый аккаунт (UTA): все продукты одним адресом
  const uta = (await call('/api/v3/account/assets', {})) as { code?: string; data?: { assets?: unknown } } | null
  if (uta?.code === '00000') return mergeBalances(arr(uta.data?.assets).map((x) => ({ account: 'spot', symbol: String(x.coin), amount: n(x.equity ?? x.balance) })))
  // классический: спот + фьючерсные счета (USDT / USDC)
  const spot = await bitgetGet<unknown>(call, '/api/v2/spot/account/assets', {})
  const out: Balance[] = arr(spot).map((x) => ({ account: 'spot', symbol: String(x.coin), amount: n(x.available) + n(x.frozen) + n(x.locked) }))
  for (const productType of ['USDT-FUTURES', 'USDC-FUTURES']) {
    out.push(
      ...(await optional(async () =>
        arr(await bitgetGet<unknown>(call, '/api/v2/mix/account/accounts', { productType })).map((x) => ({
          account: 'futures' as const,
          symbol: String(x.marginCoin),
          amount: n(x.accountEquity ?? x.usdtEquity),
        })),
      )),
    )
  }
  return mergeBalances(out)
}

// ---------- BingX ----------
export async function bingxBalances(call: CexCall): Promise<Balance[]> {
  const spot = await bingxGet<{ balances?: unknown }>(call, '/openApi/spot/v1/account/balance', {})
  const out: Balance[] = arr(spot.balances).map((x) => ({ account: 'spot', symbol: String(x.asset), amount: n(x.free) + n(x.locked) }))
  out.push(
    ...(await optional(async () => {
      const d = await bingxGet<{ balance?: unknown } | Obj[]>(call, '/openApi/swap/v2/user/balance', {})
      const list = Array.isArray(d) ? d : Array.isArray(d.balance) ? (d.balance as Obj[]) : d.balance ? [d.balance as Obj] : []
      return list.map((x) => ({ account: 'futures' as const, symbol: String(x.asset), amount: n(x.equity ?? x.balance) }))
    })),
  )
  return mergeBalances(out)
}

// ---------- Hyperliquid (по адресу, без ключа) ----------
export async function hyperliquidBalances(address: string, fetchFn: typeof fetch = fetch): Promise<Balance[]> {
  const post = async (type: string) => {
    const res = await fetchFn(HL_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, user: address }) })
    if (!res.ok) throw new Error(`HL_HTTP_${res.status} network`)
    return (await res.json()) as Obj
  }
  const spot = await post('spotClearinghouseState')
  const out: Balance[] = arr(spot.balances).map((x) => ({ account: 'spot', symbol: String(x.coin), amount: n(x.total) }))
  // перпы: стоимость счёта (маржа + нереализованный PnL) в USDC
  const perp = await post('clearinghouseState')
  const value = n((perp.marginSummary as Obj | undefined)?.accountValue)
  if (value > 0) out.push({ account: 'perp', symbol: 'USDC', amount: value })
  return mergeBalances(out)
}

// ---------- Polymarket (по адресу) ----------
/** Открытые позиции по текущей цене исхода — одной строкой «POLYMARKET» со стоимостью в $ */
export async function polymarketBalances(get: PmGet, address: string): Promise<Balance[]> {
  let total = 0
  let cursor = ''
  for (let page = 0; page < 20; page++) {
    const res = (await get('/v2/positions', { user: address, status: 'OPEN', limit: 100, ...(cursor ? { cursor } : {}) })) as unknown
    const r = (res ?? {}) as Obj
    const items = Array.isArray(res) ? (res as Obj[]) : arr(r.data ?? r.positions)
    for (const p of items) {
      const value = n(p.current_value ?? p.currentValue)
      total += value > 0 ? value : n(p.total_size ?? p.size) * n(p.cur_price ?? p.curPrice)
    }
    const pag = (r.pagination ?? {}) as Obj
    const next = typeof pag.next_cursor === 'string' ? pag.next_cursor : ''
    if (!next || !items.length) break
    cursor = next
  }
  return total > 0 ? [{ account: 'prediction', symbol: 'POLYMARKET', amount: total, value_usd: Math.round(total * 100) / 100 }] : []
}

/** Балансы одного подключения */
export async function fetchBalances(conn: { exchange: string; api_key: string }, deps: BalanceDeps): Promise<Balance[]> {
  switch (conn.exchange) {
    case 'bybit':
      return bybitBalances(deps.cexCall)
    case 'binance':
      return binanceBalances(deps.cexCall)
    case 'okx':
      return okxBalances(deps.cexCall)
    case 'bitget':
      return bitgetBalances(deps.cexCall)
    case 'bingx':
      return bingxBalances(deps.cexCall)
    case 'hyperliquid':
      return hyperliquidBalances(conn.api_key, deps.fetchFn)
    case 'polymarket':
      return polymarketBalances(deps.polymarketGet ?? pmDirectGet(deps.fetchFn), conn.api_key)
    default:
      return []
  }
}
