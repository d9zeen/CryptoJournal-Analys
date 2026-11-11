/**
 * Календарь прибыли: месяц сеткой по неделям с понедельника — только недели, где есть дни этого месяца (4–6 рядов),
 * по каждому дню — PnL, число сделок и винрейт; справа — итог недели (только дни этого месяца), внизу — итог месяца
 * с самой прибыльной и самой убыточной сделкой. Дни соседних месяцев в сетке пустые.
 * День сделки — дата закрытия в часовом поясе пользователя.
 */
import { monthGrid, ymd } from '@/lib/period'
import { zonedParts } from '@/lib/tz'
import { getLang, type Lang } from '@/lib/locale'

export type CalCell = { pnl: number; count: number; wins: number }
export type CalDay = CalCell & { date: string; day: number; inMonth: boolean }
export type CalWeek = { days: CalDay[]; total: CalCell }
/** Итог месяца: best / worst — самая прибыльная и самая убыточная сделка (null — таких нет) */
export type CalMonth = CalCell & { best: number | null; worst: number | null }
export type ProfitCalendar = { weeks: CalWeek[]; month: CalMonth }

const empty = (): CalCell => ({ pnl: 0, count: 0, wins: 0 })
const add = (c: CalCell, pnl: number) => {
  c.pnl += pnl
  c.count++
  if (pnl > 0) c.wins++
}

/** month — 0…11 */
export function profitCalendar(closed: { exit_at: string; pnl: number }[], year: number, month: number, timeZone: string): ProfitCalendar {
  const byDate = new Map<string, CalCell>()
  const ym = `${year}-${String(month + 1).padStart(2, '0')}`
  let best: number | null = null
  let worst: number | null = null
  for (const t of closed) {
    const { date } = zonedParts(t.exit_at, timeZone)
    const c = byDate.get(date) ?? empty()
    add(c, t.pnl)
    byDate.set(date, c)
    if (date.startsWith(ym)) {
      if (t.pnl > 0 && (best === null || t.pnl > best)) best = t.pnl
      if (t.pnl < 0 && (worst === null || t.pnl < worst)) worst = t.pnl
    }
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
      if (inMonth) {
        total.pnl += c.pnl
        total.count += c.count
        total.wins += c.wins
        monthCell.pnl += c.pnl
        monthCell.count += c.count
        monthCell.wins += c.wins
      }
      return { ...c, date, day: d.getDate(), inMonth }
    })
    // неделя целиком из соседнего месяца не нужна: сетка заканчивается на последней неделе месяца
    if (days.some((d) => d.inMonth)) weeks.push({ days, total })
  }
  return { weeks, month: { ...monthCell, best, worst } }
}

/** Даты сетки — для запроса сделок: первый и последний день (YYYY-MM-DD) */
export function calendarSpan(year: number, month: number): { first: string; last: string } {
  const dates = monthGrid(year, month)
  return { first: ymd(dates[0]), last: ymd(dates[dates.length - 1]) }
}

/**
 * Коротко для узких клеток на телефоне: до 1000 — целое («+92», «−95»),
 * от 1000 — «+1,7к» (en: «+1.7k»), от миллиона — «+1,2м» (en: «+1.2M»); минус — типографский «−».
 */
export function compactPnl(n: number, lang: Lang = getLang()): string {
  const a = Math.abs(n)
  const sign = n > 0 ? '+' : n < 0 ? '−' : ''
  const ru = lang === 'ru'
  const short = (v: number, unit: string) => `${ru ? String(Math.round(v * 10) / 10).replace('.', ',') : String(Math.round(v * 10) / 10)}${unit}`
  let s: string
  if (Math.round(a) < 1000) s = String(Math.round(a))
  else if (Math.round(a / 100) / 10 < 1000) s = short(a / 1000, ru ? 'к' : 'k')
  else s = short(a / 1_000_000, ru ? 'м' : 'M')
  return s === '0' ? '0' : sign + s
}

export type MonthSummary = {
  /** дни месяца со сделками */
  tradedDays: number
  upDays: number
  downDays: number
  best: CalDay | null
  worst: CalDay | null
  /** средний PnL на торговый день */
  avgDay: number | null
  /** PnL по неделям сетки (только дни этого месяца), null — в неделе нет дней месяца */
  weeks: (CalCell | null)[]
  /** PnL по дням недели Пн…Вс (только дни этого месяца) */
  weekdays: CalCell[]
  /** самый большой |PnL| дня в месяце — для яркости клеток */
  maxAbsDay: number
}

/** Итоги месяца для боковой панели календаря: дни в плюс / минус, лучший и худший день, недели, дни недели */
export function monthSummary(cal: ProfitCalendar): MonthSummary {
  const days = cal.weeks.flatMap((w) => w.days).filter((d) => d.inMonth && d.count > 0)
  const best = days.reduce<CalDay | null>((b, d) => (b === null || d.pnl > b.pnl ? d : b), null)
  const worst = days.reduce<CalDay | null>((b, d) => (b === null || d.pnl < b.pnl ? d : b), null)
  const weekdays = Array.from({ length: 7 }, empty)
  const weeks = cal.weeks.map((w) => {
    const inMonth = w.days.filter((d) => d.inMonth)
    if (!inMonth.length) return null
    const c = empty()
    w.days.forEach((d, i) => {
      if (!d.inMonth) return
      c.pnl += d.pnl
      c.count += d.count
      c.wins += d.wins
      weekdays[i].pnl += d.pnl
      weekdays[i].count += d.count
      weekdays[i].wins += d.wins
    })
    return c
  })
  return {
    tradedDays: days.length,
    upDays: days.filter((d) => d.pnl > 0).length,
    downDays: days.filter((d) => d.pnl < 0).length,
    best: best && best.pnl > 0 ? best : null,
    worst: worst && worst.pnl < 0 ? worst : null,
    avgDay: days.length ? cal.month.pnl / days.length : null,
    weeks,
    weekdays,
    maxAbsDay: Math.max(0, ...days.map((d) => Math.abs(d.pnl))),
  }
}

/** Строка панели «По неделям»: с какого по какое число месяца и итог за эти дни */
export type WeekRow = { from: number; to: number; cell: CalCell }
/**
 * rows — как ряды календаря (Пн–Вс, крайние могут быть из 1–2 дней);
 * merge — ряды, но крайний ряд короче 4 дней приклеен к соседнему;
 * days — по числам месяца: 1–7, 8–14, 15–21, 22–28, 29–конец
 */
export type WeekMode = 'rows' | 'merge' | 'days'

export function monthWeeks(cal: ProfitCalendar, mode: WeekMode): WeekRow[] {
  const sumOf = (days: CalDay[]): CalCell => days.reduce((c, d) => ({ pnl: c.pnl + d.pnl, count: c.count + d.count, wins: c.wins + d.wins }), empty())
  const row = (days: CalDay[]): WeekRow => ({ from: days[0].day, to: days[days.length - 1].day, cell: sumOf(days) })
  if (mode === 'days') {
    const all = cal.weeks.flatMap((w) => w.days).filter((d) => d.inMonth)
    const chunks: CalDay[][] = []
    for (const d of all) (chunks[Math.min(4, Math.floor((d.day - 1) / 7))] ??= []).push(d)
    return chunks.filter(Boolean).map(row)
  }
  const groups = cal.weeks.map((w) => w.days.filter((d) => d.inMonth))
  if (mode === 'merge' && groups.length > 1) {
    if (groups[0].length < 4) groups.splice(0, 2, [...groups[0], ...groups[1]])
    const n = groups.length
    if (n > 1 && groups[n - 1].length < 4) groups.splice(n - 2, 2, [...groups[n - 2], ...groups[n - 1]])
  }
  return groups.map(row)
}
