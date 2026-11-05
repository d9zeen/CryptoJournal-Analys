/** Время точек кривой капитала — для оси дат и подсказок. */
import type { EquityPoint } from '@/lib/calc/stats'
import { formatPercent, formatPnl } from '@/lib/format'

export type EquityUnit = 'usd' | 'pct'

/** Значение в выбранных единицах: $ или % от стартового депозита */
export const inUnit = (v: number, unit: EquityUnit, balance: number | null) => (unit === 'pct' && balance ? (v / balance) * 100 : v)

/** +1 234,56 $ / +12,3 % */
export function formatUnit(v: number, unit: EquityUnit): string {
  if (unit === 'usd') return formatPnl(v)
  const s = formatPercent(Math.abs(v) / 100)
  return v > 0 ? `+${s}` : v < 0 ? `−${s}` : s
}

export type TimedPoint = EquityPoint & { t: number }

/**
 * Каждой точке — время закрытия сделки (мс). Старт (n = 0, at = null) ставим чуть раньше первой сделки,
 * чтобы кривая начиналась с нуля плавно, а не вертикальным скачком у левого края.
 */
export function withTime(points: EquityPoint[]): TimedPoint[] {
  const times = points.map((p) => (p.at ? Date.parse(p.at) : Number.NaN))
  const known = times.filter((x) => !Number.isNaN(x))
  const first = known.length ? Math.min(...known) : Date.now()
  const last = known.length ? Math.max(...known) : first
  const lead = Math.max((last - first) * 0.004, 3_600_000)
  return points.map((p, i) => ({ ...p, t: Number.isNaN(times[i]) ? first - lead : times[i] }))
}

/** Добавить в прореженную кривую нужные точки (пик и дно просадки), если прореживание их выкинуло. */
export function withPoints(down: EquityPoint[], full: EquityPoint[], ns: number[]): EquityPoint[] {
  const have = new Set(down.map((p) => p.n))
  const extra = ns.filter((n) => !have.has(n) && full[n]).map((n) => full[n])
  return extra.length ? [...down, ...extra].sort((a, b) => a.n - b.n) : down
}

/** 03.11 */
export function shortDate(ms: number): string {
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit' }).format(ms)
}

/** 3 ноября */
export function longDate(ms: number): string {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(ms)
}

/** Сколько полных дней между двумя моментами */
export function daysBetween(a: number, b: number): number {
  return Math.max(0, Math.round((b - a) / 86_400_000))
}
