/**
 * Портфель (0019): балансы × цены → строки таблицы, итоги, доли, лучший / худший за 24 ч, ряды графика.
 * Цена монеты — по символу; при совпадении символов берём монету с большей капитализацией (меньший rank):
 * мусорные токены с тем же тикером не «раздувают» портфель (дыра №7 из плана).
 * Монеты без цены показываются, но в сумму не входят. Стейблкоины без указанной цены входа считаются по 1 $.
 */

export type Coin = {
  id: string
  symbol: string
  name: string
  rank: number | null
  price: number | null
  change_24h: number | null
  change_7d: number | null
  spark: number[] | null
  icon: string | null
  /** цвет монеты из логотипа (#rrggbb) — доли в кольце */
  color?: string | null
}

export type Holding = {
  id: string
  connection_id: string | null
  account: string
  symbol: string
  amount: number
  value_usd: number | null
  note: string | null
  updated_at: string
}

export type Snapshot = { at: string; total_usd: number; btc_price: number | null }

/** Стейблкоины: цена входа по умолчанию — 1 $ */
export const STABLES: ReadonlySet<string> = new Set(['USDT', 'USDC', 'DAI', 'FDUSD', 'TUSD', 'USDE', 'PYUSD', 'USDD', 'BUSD', 'USD1', 'RLUSD'])

/** Монеты дешевле этого — «мелочь» (скрываются переключателем) */
export const DUST_USD = 1

export type PortfolioRow = {
  symbol: string
  coin: Coin | null
  amount: number
  /** стоимость в $ (null — нет цены) */
  value: number | null
  price: number | null
  /** изменение за 24 ч: % и $ */
  change24: number | null
  change24Usd: number | null
  avgPrice: number | null
  /** цена входа указана руками (иначе — из истории покупок, стейблкоин по 1 $ или неизвестна) */
  avgManual: boolean
  /** откуда цена входа: руками, из покупок на биржах, стейблкоин — 1 $ */
  avgSource: 'manual' | 'trades' | 'stable' | null
  /** по покупкам на биржах: сколько монет из нынешнего количества куплено (0…1; меньше 1 — часть пришла переводом) */
  covered: number | null
  /** прибыль, зафиксированная продажами этой монеты (из истории сделок) */
  realized: number
  invested: number | null
  pnl: number | null
  pnlPct: number | null
  /** доля от стоимости портфеля, 0…1 */
  share: number
  /** откуда монета: id подключений (null — вручную) */
  sources: (string | null)[]
  /** строки holdings этой монеты */
  holdings: Holding[]
}

const num = (v: unknown): number | null => {
  const x = typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : NaN
  return Number.isFinite(x) ? x : null
}

/** Символ → монета с наибольшей капитализацией */
export function coinsBySymbol(coins: Coin[]): Map<string, Coin> {
  const map = new Map<string, Coin>()
  for (const c of coins) {
    const prev = map.get(c.symbol)
    if (!prev || (c.rank ?? Infinity) < (prev.rank ?? Infinity)) map.set(c.symbol, c)
  }
  return map
}

/**
 * Строки таблицы: одна монета — одна строка (со всех бирж и счетов).
 * source — показать только одно подключение (id) или монеты вручную ('manual'); null — всё.
 */
export function portfolioRows(
  holdings: Holding[],
  coins: Coin[],
  costs: Record<string, number>,
  source: string | null = null,
  basis: Record<string, CostBasis> = {},
): PortfolioRow[] {
  const bySym = coinsBySymbol(coins)
  const groups = new Map<string, Holding[]>()
  for (const h of holdings) {
    if (source === 'manual' ? h.connection_id !== null : source !== null && h.connection_id !== source) continue
    groups.set(h.symbol, [...(groups.get(h.symbol) ?? []), h])
  }
  const rows: PortfolioRow[] = []
  for (const [symbol, hs] of groups) {
    const coin = bySym.get(symbol) ?? null
    const amount = hs.reduce((a, h) => a + (num(h.amount) ?? 0), 0)
    const known = hs.every((h) => h.value_usd !== null) ? hs.reduce((a, h) => a + (num(h.value_usd) ?? 0), 0) : null
    const price = coin?.price ?? null
    const value = known ?? (price !== null ? amount * price : null)
    const change24 = coin?.change_24h ?? null
    // стоимость сутки назад = сейчас / (1 + %): разница — сколько принесли сутки
    const change24Usd = value !== null && change24 !== null && known === null ? value - value / (1 + change24 / 100) : null
    const manual = costs[symbol]
    const fromTrades = basis[symbol]?.qty > 0 ? basis[symbol].avg : null
    // приоритет: руками → по покупкам на биржах → стейблкоин 1 $
    const avgPrice = manual ?? fromTrades ?? (STABLES.has(symbol) ? 1 : null)
    const avgSource = manual !== undefined ? 'manual' : fromTrades !== null ? 'trades' : STABLES.has(symbol) ? 'stable' : null
    const invested = avgPrice !== null && known === null ? avgPrice * amount : null
    const pnl = invested !== null && value !== null ? value - invested : null
    rows.push({
      symbol,
      coin,
      amount,
      value,
      price,
      change24,
      change24Usd,
      avgPrice: known === null ? avgPrice : null,
      avgManual: manual !== undefined,
      avgSource: known === null ? avgSource : null,
      covered: fromTrades !== null && amount > 0 ? Math.min(1, basis[symbol].qty / amount) : null,
      realized: basis[symbol]?.realized ?? 0,
      invested,
      pnl,
      pnlPct: pnl !== null && invested ? pnl / invested : null,
      share: 0,
      sources: [...new Set(hs.map((h) => h.connection_id))],
      holdings: hs,
    })
  }
  const total = rows.reduce((a, r) => a + (r.value ?? 0), 0)
  for (const r of rows) r.share = total > 0 && r.value ? r.value / total : 0
  // сначала дорогие; монеты без цены — в конце, по символу
  return rows.sort((a, b) => (b.value ?? -1) - (a.value ?? -1) || a.symbol.localeCompare(b.symbol))
}

export type SpotFillLike = { asset: string; quote: string; side: 'buy' | 'sell'; qty: number; price: number; fee: number; fee_asset: string | null; at: string }
/** По монете из истории сделок: сколько осталось купленного, средняя цена входа, зафиксированная прибыль */
export type CostBasis = { qty: number; avg: number | null; realized: number; bought: number }

/** Котировки, равные доллару: только по ним считаем цену входа (BTC-котировки без исторической цены BTC не считаем) */
const USD_QUOTES: ReadonlySet<string> = new Set(['USDT', 'USDC', 'FDUSD', 'USDE', 'TUSD', 'BUSD', 'USD1', 'DAI', 'USD'])

/**
 * Средняя цена входа по истории спотовых покупок / продаж (средневзвешенная, как у бирж):
 *  - покупка: +количество (минус комиссия, если она в этой монете), +стоимость (плюс комиссия, если она в котировке);
 *  - продажа: фиксируем прибыль (цена продажи − средняя цена входа) × количество − комиссия; средняя цена не меняется;
 *    продают больше, чем куплено по истории (монеты пришли переводом) — лишнее в расчёт не берём;
 *  - всё продано — следующая покупка начинает среднюю заново.
 * Комиссия в третьей монете (BNB) не учитывается — она мала и в долларах на момент сделки неизвестна.
 */
export function costBasis(fills: SpotFillLike[]): Record<string, CostBasis> {
  const st: Record<string, { qty: number; cost: number; realized: number; bought: number }> = {}
  const sorted = [...fills].sort((a, b) => a.at.localeCompare(b.at))
  for (const f of sorted) {
    if (!USD_QUOTES.has(f.quote) || !(f.qty > 0) || !(f.price > 0)) continue
    const s = (st[f.asset] ??= { qty: 0, cost: 0, realized: 0, bought: 0 })
    const feeInQuote = f.fee_asset === f.quote ? f.fee : 0
    const feeInAsset = f.fee_asset === f.asset ? f.fee : 0
    if (f.side === 'buy') {
      const got = Math.max(0, f.qty - feeInAsset)
      s.qty += got
      s.bought += got
      s.cost += f.qty * f.price + feeInQuote
    } else {
      if (s.qty <= 1e-12) continue
      const sold = Math.min(f.qty + feeInAsset, s.qty)
      const part = sold / (f.qty + feeInAsset)
      const avg = s.cost / s.qty
      s.realized += sold * f.price * (f.qty / (f.qty + feeInAsset)) - feeInQuote * part - avg * sold
      s.cost -= avg * sold
      s.qty -= sold
      if (s.qty <= 1e-12) {
        s.qty = 0
        s.cost = 0
      }
    }
  }
  const out: Record<string, CostBasis> = {}
  for (const [asset, s] of Object.entries(st)) out[asset] = { qty: s.qty, avg: s.qty > 0 ? s.cost / s.qty : null, realized: s.realized, bought: s.bought }
  return out
}

/** Прибыль, зафиксированная продажами по всем монетам (и тем, которых уже нет на балансе) */
export const realizedTotal = (basis: Record<string, CostBasis>) => Object.values(basis).reduce((a, b) => a + b.realized, 0)

export type PortfolioTotals = {
  value: number
  change24Usd: number
  /** % за 24 ч (по монетам с известным изменением) */
  change24: number | null
  invested: number
  pnl: number
  pnlPct: number | null
  /** у скольких монет известна цена входа / сколько всего монет с ценой */
  withCost: number
  priced: number
  unpriced: number
}

export function portfolioTotals(rows: PortfolioRow[]): PortfolioTotals {
  let value = 0
  let change24Usd = 0
  let base24 = 0
  let invested = 0
  let valueWithCost = 0
  let withCost = 0
  let priced = 0
  for (const r of rows) {
    if (r.value === null) continue
    priced++
    value += r.value
    if (r.change24Usd !== null) {
      change24Usd += r.change24Usd
      base24 += r.value - r.change24Usd
    }
    if (r.invested !== null) {
      withCost++
      invested += r.invested
      valueWithCost += r.value
    }
  }
  const pnl = valueWithCost - invested
  return {
    value,
    change24Usd,
    change24: base24 > 0 ? change24Usd / base24 : null,
    invested,
    pnl,
    pnlPct: invested > 0 ? pnl / invested : null,
    withCost,
    priced,
    unpriced: rows.length - priced,
  }
}

/** Доли для кольца: top самых крупных + «Другое» */
export function allocation(rows: PortfolioRow[], top = 5): { symbol: string | null; value: number; share: number; color: string | null }[] {
  const priced = rows.filter((r) => r.value !== null && r.value > 0)
  const head = priced.slice(0, top).map((r) => ({ symbol: r.symbol as string | null, value: r.value!, share: r.share, color: r.coin?.color ?? null }))
  const tail = priced.slice(top)
  if (tail.length) head.push({ symbol: null, value: tail.reduce((a, r) => a + r.value!, 0), share: tail.reduce((a, r) => a + r.share, 0), color: null })
  return head
}

/** Лучшая и худшая монета за 24 ч (среди тех, что дороже 1 $; стейблкоины не в счёт) */
export function movers(rows: PortfolioRow[]): { best: PortfolioRow | null; worst: PortfolioRow | null } {
  const list = rows.filter((r) => r.change24 !== null && (r.value ?? 0) >= DUST_USD && !STABLES.has(r.symbol))
  if (!list.length) return { best: null, worst: null }
  const sorted = [...list].sort((a, b) => b.change24! - a.change24!)
  const best = sorted[0].change24! > 0 ? sorted[0] : null
  const worst = sorted[sorted.length - 1].change24! < 0 ? sorted[sorted.length - 1] : null
  return { best, worst }
}

export type PortfolioRange = '24h' | '7d' | '1m' | '3m' | '1y' | 'all'
const RANGE_MS: Record<PortfolioRange, number> = { '24h': 864e5, '7d': 7 * 864e5, '1m': 30 * 864e5, '3m': 91 * 864e5, '1y': 365 * 864e5, all: Infinity }

export type SeriesPoint = { t: number; value: number; btc: number | null }

/**
 * Шаг точек графика: за длинный период — не каждый снимок (раз в час), а последний в окне (6 ч / сутки),
 * иначе линия превращается в «пилу» из мелких колебаний.
 */
const STEP_MS: Record<PortfolioRange, number> = { '24h': 0, '7d': 3 * 3_600_000, '1m': 6 * 3_600_000, '3m': 864e5, '1y': 864e5, all: 864e5 }

/** Последняя точка в каждом окне шага (точки уже по времени) */
export function thinOut<T extends { t: number }>(pts: T[], step: number): T[] {
  if (step <= 0 || pts.length < 3) return pts
  const out: T[] = []
  for (const p of pts) {
    const prev = out[out.length - 1]
    if (prev && Math.floor(prev.t / step) === Math.floor(p.t / step)) out[out.length - 1] = p
    else out.push(p)
  }
  return out
}

/**
 * Точки графика за период: стоимость и «если бы всё было в BTC» — сколько стоили бы деньги первой точки,
 * переложенные в BTC по её цене. now — текущая стоимость (последняя точка «сейчас», если снимок старше часа).
 */
export function portfolioSeries(snaps: Snapshot[], range: PortfolioRange, nowMs: number, now?: { value: number; btcPrice: number | null }): SeriesPoint[] {
  const from = nowMs - RANGE_MS[range]
  const pts = thinOut(
    snaps
      .map((s) => ({ t: Date.parse(s.at), value: num(s.total_usd) ?? 0, btcPrice: num(s.btc_price) }))
      .filter((p) => Number.isFinite(p.t) && p.t >= from)
      .sort((a, b) => a.t - b.t),
    STEP_MS[range],
  )
  if (now && now.value > 0 && (!pts.length || nowMs - pts[pts.length - 1].t > 3_600_000)) pts.push({ t: nowMs, value: now.value, btcPrice: now.btcPrice })
  if (!pts.length) return []
  const first = pts[0]
  const coins = first.btcPrice ? first.value / first.btcPrice : null
  return pts.map((p) => ({ t: p.t, value: Math.round(p.value * 100) / 100, btc: coins !== null && p.btcPrice ? Math.round(coins * p.btcPrice * 100) / 100 : null }))
}
