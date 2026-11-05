/**
 * Календарь прибыли: месяц сеткой 6 × 7 (неделя с понедельника), по каждому дню — PnL, число сделок и винрейт,
 * справа — итог недели (вместе с днями соседних месяцев, как они видны в сетке), внизу — итог месяца.
 * День сделки — дата закрытия в часовом поясе пользователя.
 */
import { monthGrid, ymd } from '@/lib/period'
import { zonedParts } from '@/lib/tz'

export type CalCell = { pnl: number; count: number; wins: number }
export type CalDay = CalCell & { date: string; day: number; inMonth: boolean }
export type CalWeek = { days: CalDay[]; total: CalCell }
export type ProfitCalendar = { weeks: CalWeek[]; month: CalCell }

const empty = (): CalCell => ({ pnl: 0, count: 0, wins: 0 })
const add = (c: CalCell, pnl: number) => {
  c.pnl += pnl
  c.count++
  if (pnl > 0) c.wins++
}

/** month — 0…11 */
export function profitCalendar(closed: { exit_at: string; pnl: number }[], year: number, month: number, timeZone: string): ProfitCalendar {
  const byDate = new Map<string, CalCell>()
  for (const t of closed) {
    const { date } = zonedParts(t.exit_at, timeZone)
    const c = byDate.get(date) ?? empty()
    add(c, t.pnl)
    byDate.set(date, c)
  }
  const dates = monthGrid(year, month)
  const weeks: CalWeek[] = []
  const monthCell = empty()
  for (let w = 0; w < 6; w++) {
    const total = empty()
    const days = dates.slice(w * 7, w * 7 + 7).map((d): CalDay => {
      const date = ymd(d)
      const c = byDate.get(date) ?? empty()
      const inMonth = d.getMonth() === month
      total.pnl += c.pnl
      total.count += c.count
      total.wins += c.wins
      if (inMonth) {
        monthCell.pnl += c.pnl
        monthCell.count += c.count
        monthCell.wins += c.wins
      }
      return { ...c, date, day: d.getDate(), inMonth }
    })
    weeks.push({ days, total })
  }
  return { weeks, month: monthCell }
}

/** Даты сетки — для запроса сделок: первый и последний день (YYYY-MM-DD) */
export function calendarSpan(year: number, month: number): { first: string; last: string } {
  const dates = monthGrid(year, month)
  return { first: ymd(dates[0]), last: ymd(dates[dates.length - 1]) }
}

/** +1.2k / −350 — для узких клеток на телефоне */
export function compactPnl(n: number): string {
  const a = Math.abs(n)
  const s = a >= 1_000_000 ? `${(a / 1_000_000).toFixed(1)}M` : a >= 1000 ? `${(a / 1000).toFixed(1)}k` : a >= 100 ? a.toFixed(0) : a.toFixed(1)
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${s.replace(/\.0(?=[kM]?$)/, '')}`
}
