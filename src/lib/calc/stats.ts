/**
 * Статистика по набору сделок для дашборда. Все суммы — в USD.
 * Правила (docs/PLAN.md, «Формулы»):
 * - в статистику попадают только закрытые сделки с посчитанным PnL;
 * - R — только по сделкам со стопом;
 * - часы и дни недели — по времени входа в часовом поясе пользователя;
 * - кривая капитала и PnL по дням — по времени выхода.
 */
import type { Side } from './trade'
import { zonedParts } from '@/lib/tz'

export type StatTrade = {
  id: string
  side: Side
  symbol: string
  entry_at: string
  exit_at: string | null
  pnl: number | string | null
  r_multiple: number | string | null
  setup_id: string | null
  emotion_id: string | null
  tagIds: string[]
}

/** Закрытая сделка с числовыми pnl / r */
export type ClosedTrade = Omit<StatTrade, 'pnl' | 'r_multiple' | 'exit_at'> & { exit_at: string; pnl: number; r: number | null }

const num = (v: number | string | null): number | null => {
  if (v === null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Только закрытые сделки, отсортированные по времени выхода. */
export function closedTrades(trades: StatTrade[]): ClosedTrade[] {
  const out: ClosedTrade[] = []
  for (const t of trades) {
    const pnl = num(t.pnl)
    if (t.exit_at === null || pnl === null) continue
    out.push({ ...t, exit_at: t.exit_at, pnl, r: num(t.r_multiple) })
  }
  return out.sort((a, b) => a.exit_at.localeCompare(b.exit_at) || a.entry_at.localeCompare(b.entry_at))
}

export type Summary = {
  closed: number
  wins: number
  losses: number
  breakeven: number
  /** 0…1, null — нет закрытых сделок */
  winrate: number | null
  totalPnl: number
  avgWin: number | null
  avgLoss: number | null
  /** Σ прибылей / |Σ убытков|; Infinity — убытков нет; null — нет ни прибылей, ни убытков */
  profitFactor: number | null
  /** Матожидание — средний PnL на сделку */
  expectancy: number | null
  avgR: number | null
  /** Сколько сделок участвовало в среднем R (со стопом) */
  rCount: number
  best: number | null
  worst: number | null
  /** Макс. просадка в $ (положительное число) */
  maxDrawdown: number
  /** Макс. просадка в долях (0…1), только при заданном стартовом депозите */
  maxDrawdownPct: number | null
}

export function summarize(closed: ClosedTrade[], startingBalance?: number | null): Summary {
  let grossWin = 0
  let grossLoss = 0
  let wins = 0
  let losses = 0
  let rSum = 0
  let rCount = 0
  let best: number | null = null
  let worst: number | null = null
  for (const t of closed) {
    if (t.pnl > 0) {
      wins++
      grossWin += t.pnl
    } else if (t.pnl < 0) {
      losses++
      grossLoss += t.pnl
    }
    if (t.r !== null) {
      rSum += t.r
      rCount++
    }
    best = best === null ? t.pnl : Math.max(best, t.pnl)
    worst = worst === null ? t.pnl : Math.min(worst, t.pnl)
  }
  const n = closed.length
  const total = grossWin + grossLoss
  const dd = drawdown(closed, startingBalance)
  return {
    closed: n,
    wins,
    losses,
    breakeven: n - wins - losses,
    winrate: n ? wins / n : null,
    totalPnl: total,
    avgWin: wins ? grossWin / wins : null,
    avgLoss: losses ? grossLoss / losses : null,
    profitFactor: grossLoss < 0 ? grossWin / -grossLoss : grossWin > 0 ? Infinity : null,
    expectancy: n ? total / n : null,
    avgR: rCount ? rSum / rCount : null,
    rCount,
    best,
    worst,
    maxDrawdown: dd.usd,
    maxDrawdownPct: dd.pct,
  }
}

/** Наибольшее падение от пика накопленного PnL. Отсчёт пика — с нуля (до первой сделки). */
export function drawdown(closed: ClosedTrade[], startingBalance?: number | null): { usd: number; pct: number | null } {
  const start = startingBalance && startingBalance > 0 ? startingBalance : null
  let cum = 0
  let peak = 0
  let usd = 0
  let pct = 0
  for (const t of closed) {
    cum += t.pnl
    peak = Math.max(peak, cum)
    usd = Math.max(usd, peak - cum)
    if (start !== null) {
      const peakEquity = start + peak
      if (peakEquity > 0) pct = Math.max(pct, (peak - cum) / peakEquity)
    }
  }
  return { usd, pct: start === null ? null : pct }
}

/** Точка кривой: n — номер сделки (0 — старт), at — время закрытия, symbol / id — для подсказки и перехода к сделке */
export type EquityPoint = { n: number; at: string | null; pnl: number; cum: number; symbol?: string; id?: string }

/** Кривая накопленного PnL: точка 0 — старт, далее по сделке на точку. */
export function equityCurve(closed: ClosedTrade[]): EquityPoint[] {
  const points: EquityPoint[] = [{ n: 0, at: null, pnl: 0, cum: 0 }]
  let cum = 0
  closed.forEach((t, i) => {
    cum += t.pnl
    points.push({ n: i + 1, at: t.exit_at, pnl: t.pnl, cum, symbol: t.symbol, id: t.id })
  })
  return points
}

/**
 * Период максимальной просадки на кривой (тот же расчёт, что drawdown(): пик считается с нуля).
 * peak / trough / recovery — номера точек (n): пик, дно и первая точка, где капитал вернулся к пику
 * (null — ещё не вернулся). null целиком — просадки не было.
 */
export type DrawdownPeriod = { peak: number; trough: number; recovery: number | null; depth: number }

export function drawdownPeriod(points: EquityPoint[]): DrawdownPeriod | null {
  let peakI = 0
  let best = { peak: 0, trough: 0, depth: 0 }
  for (let i = 0; i < points.length; i++) {
    // >= — пик берём последний из равных: так длительность просадки честнее
    if (points[i].cum >= points[peakI].cum) peakI = i
    const depth = points[peakI].cum - points[i].cum
    if (depth > best.depth) best = { peak: peakI, trough: i, depth }
  }
  if (best.depth <= 0) return null
  let recovery: number | null = null
  for (let i = best.trough + 1; i < points.length; i++) {
    if (points[i].cum >= points[best.peak].cum) {
      recovery = points[i].n
      break
    }
  }
  return { peak: points[best.peak].n, trough: points[best.trough].n, recovery, depth: best.depth }
}

/** Средний выигрыш и средний проигрыш в R — только по сделкам со стопом (r не null). */
export function rWinLoss(closed: ClosedTrade[]): { avgWinR: number | null; avgLossR: number | null } {
  let win = 0
  let winN = 0
  let loss = 0
  let lossN = 0
  for (const t of closed) {
    if (t.r === null) continue
    if (t.r > 0) {
      win += t.r
      winN++
    } else if (t.r < 0) {
      loss += t.r
      lossN++
    }
  }
  return { avgWinR: winN ? win / winN : null, avgLossR: lossN ? loss / lossN : null }
}

export type DayPnl = { date: string; pnl: number; count: number }

/** PnL по дням закрытия (в часовом поясе пользователя). */
export function pnlByDay(closed: ClosedTrade[], timeZone: string): DayPnl[] {
  const map = new Map<string, DayPnl>()
  for (const t of closed) {
    const { date } = zonedParts(t.exit_at, timeZone)
    const d = map.get(date) ?? { date, pnl: 0, count: 0 }
    d.pnl += t.pnl
    d.count++
    map.set(date, d)
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export type Group<K> = {
  key: K
  count: number
  wins: number
  winrate: number
  pnl: number
  avgR: number | null
  /** Сумма убытков (≤ 0) — для «топа ошибок» */
  lossSum: number
}

function makeGroup<K>(key: K): Group<K> & { rSum: number; rCount: number } {
  return { key, count: 0, wins: 0, winrate: 0, pnl: 0, avgR: null, lossSum: 0, rSum: 0, rCount: 0 }
}

function finish<K>(groups: Iterable<Group<K> & { rSum: number; rCount: number }>): Group<K>[] {
  return [...groups].map(({ rSum, rCount, ...g }) => ({
    ...g,
    winrate: g.count ? g.wins / g.count : 0,
    avgR: rCount ? rSum / rCount : null,
  }))
}

/** Группировка сделок по ключу. Сделка может попасть в несколько групп (теги ошибок). */
export function groupBy<K>(closed: ClosedTrade[], keysOf: (t: ClosedTrade) => K[]): Group<K>[] {
  const map = new Map<K, ReturnType<typeof makeGroup<K>>>()
  for (const t of closed) {
    for (const key of keysOf(t)) {
      let g = map.get(key)
      if (!g) {
        g = makeGroup(key)
        map.set(key, g)
      }
      g.count++
      g.pnl += t.pnl
      if (t.pnl > 0) g.wins++
      if (t.pnl < 0) g.lossSum += t.pnl
      if (t.r !== null) {
        g.rSum += t.r
        g.rCount++
      }
    }
  }
  return finish(map.values())
}

/** Сетапы, по убыванию PnL. key null — «без сетапа». */
export const bySetup = (closed: ClosedTrade[]) => groupBy(closed, (t) => [t.setup_id]).sort((a, b) => b.pnl - a.pnl)

/** Эмоции, по убыванию PnL. key null — «не указана». */
export const byEmotion = (closed: ClosedTrade[]) => groupBy(closed, (t) => [t.emotion_id]).sort((a, b) => b.pnl - a.pnl)

/** Пары, по убыванию PnL. */
export const bySymbol = (closed: ClosedTrade[]) => groupBy(closed, (t) => [t.symbol]).sort((a, b) => b.pnl - a.pnl)

/** Long / Short — всегда обе строки, в этом порядке. */
export function bySide(closed: ClosedTrade[]): Group<Side>[] {
  const groups = groupBy(closed, (t) => [t.side])
  return (['long', 'short'] as const).map((s) => groups.find((g) => g.key === s) ?? finish([makeGroup<Side>(s)])[0])
}

/** Топ ошибок: сумма убытков сделок с тегом, самые дорогие сверху. Сделка с двумя тегами — в обоих. */
export const topMistakes = (closed: ClosedTrade[]) =>
  groupBy(closed, (t) => t.tagIds).sort((a, b) => a.lossSum - b.lossSum || b.count - a.count)

/** По дням недели входа: 7 строк, Пн…Вс. */
export function byWeekday(closed: ClosedTrade[], timeZone: string): Group<number>[] {
  const groups = groupBy(closed, (t) => [zonedParts(t.entry_at, timeZone).weekday])
  return Array.from({ length: 7 }, (_, d) => groups.find((g) => g.key === d) ?? finish([makeGroup(d)])[0])
}

/** По часу входа: 24 строки, 0…23. */
export function byHour(closed: ClosedTrade[], timeZone: string): Group<number>[] {
  const groups = groupBy(closed, (t) => [zonedParts(t.entry_at, timeZone).hour])
  return Array.from({ length: 24 }, (_, h) => groups.find((g) => g.key === h) ?? finish([makeGroup(h)])[0])
}

/**
 * Прореживание кривой PnL для графика: не больше ~max точек, но пики и провалы сохраняются
 * (в каждой «корзине» берём минимум и максимум), первая и последняя точки — всегда.
 */
export function downsampleEquity(points: EquityPoint[], max = 400): EquityPoint[] {
  if (points.length <= max) return points
  const size = Math.ceil((points.length - 2) / Math.max(1, Math.floor((max - 2) / 2)))
  const out: EquityPoint[] = [points[0]]
  for (let i = 1; i < points.length - 1; i += size) {
    const chunk = points.slice(i, Math.min(i + size, points.length - 1))
    let lo = chunk[0]
    let hi = chunk[0]
    for (const p of chunk) {
      if (p.cum < lo.cum) lo = p
      if (p.cum > hi.cum) hi = p
    }
    if (lo === hi) out.push(lo)
    else out.push(...(lo.n < hi.n ? [lo, hi] : [hi, lo]))
  }
  out.push(points[points.length - 1])
  return out
}

export type BarUnit = 'day' | 'week' | 'month'

/** Понедельник недели для даты YYYY-MM-DD */
function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

/** Если дней слишком много для графика — складываем по неделям, а если и их много — по месяцам. */
export function pnlBars(days: DayPnl[], maxBars = 120): { unit: BarUnit; bars: DayPnl[] } {
  if (days.length <= maxBars) return { unit: 'day', bars: days }
  const group = (keyOf: (d: string) => string) => {
    const map = new Map<string, DayPnl>()
    for (const d of days) {
      const key = keyOf(d.date)
      const b = map.get(key) ?? { date: key, pnl: 0, count: 0 }
      b.pnl += d.pnl
      b.count += d.count
      map.set(key, b)
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
  }
  const weeks = group(weekStart)
  if (weeks.length <= maxBars) return { unit: 'week', bars: weeks }
  return { unit: 'month', bars: group((d) => `${d.slice(0, 7)}-01`) }
}

/** Итог одной сделки без денег: в плюс, в минус или в ноль */
export type Outcome = 'win' | 'loss' | 'even'

export type RecentForm = {
  /** последние n сделок по порядку закрытия, самая новая — последней */
  items: Outcome[]
  wins: number
  losses: number
  even: number
  /** текущая серия подряд с конца (сделки в ноль серию не прерывают и не считаются); null — серии нет */
  streak: { kind: 'win' | 'loss'; length: number } | null
}

/** «Форма» за последние n сделок: сколько побед и поражений, без сумм. Порядок — как на кривой капитала. */
export function recentForm(closed: { pnl: number }[], n: number): RecentForm {
  const items: Outcome[] = closed.slice(-n).map((t) => (t.pnl > 0 ? 'win' : t.pnl < 0 ? 'loss' : 'even'))
  let streak: RecentForm['streak'] = null
  for (let i = closed.length - 1; i >= 0; i--) {
    const p = closed[i].pnl
    if (p === 0) continue
    const kind = p > 0 ? 'win' : 'loss'
    if (!streak) streak = { kind, length: 1 }
    else if (streak.kind === kind) streak.length++
    else break
  }
  return {
    items,
    wins: items.filter((o) => o === 'win').length,
    losses: items.filter((o) => o === 'loss').length,
    even: items.filter((o) => o === 'even').length,
    streak,
  }
}
