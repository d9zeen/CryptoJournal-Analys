import type { DateRange } from '@/features/trades/api'
import { addDays, browserTimeZone, zonedMidnight, zonedParts } from '@/lib/tz'

export type PeriodPreset = 'week' | 'month' | 'all' | 'custom'
export type CustomRange = { from: string; to: string } // YYYY-MM-DD, включительно

/**
 * Диапазон дат для пресета — в часовом поясе пользователя (профиль, иначе браузер): те же сутки, что в календаре
 * и «PnL по дням» (zonedParts). to — не включительно.
 */
export function rangeFor(preset: PeriodPreset, custom: CustomRange, now = new Date(), timeZone = browserTimeZone()): DateRange {
  const at = (day: string) => zonedMidnight(day, timeZone).toISOString()
  const today = zonedParts(now.toISOString(), timeZone)
  switch (preset) {
    case 'week': {
      const from = addDays(today.date, -today.weekday) // понедельник
      return { from: at(from), to: at(addDays(from, 7)) }
    }
    case 'month': {
      const first = `${today.date.slice(0, 7)}-01`
      return { from: at(first), to: at(nextMonth(first)) }
    }
    case 'custom':
      return { from: custom.from ? at(custom.from) : null, to: custom.to ? at(addDays(custom.to, 1)) : null }
    default:
      return { from: null, to: null }
  }
}

/** '2026-12-01' → '2027-01-01' */
function nextMonth(first: string): string {
  const [y, m] = first.split('-').map(Number)
  return m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`
}
/** '2026-01-01' → '2025-12-01' */
function prevMonth(first: string): string {
  const [y, m] = first.split('-').map(Number)
  return m === 1 ? `${y - 1}-12-01` : `${y}-${pad(m - 1)}-01`
}

/**
 * Прошлый период той же длины — для сравнения на «Статистике»:
 * неделя → прошлая неделя, месяц → прошлый календарный месяц, свой диапазон → такой же отрезок прямо перед ним;
 * «всё время» и незаполненный свой диапазон — без сравнения (null).
 * vs — какую подпись показать («к прошлой неделе» / «к октябрю» / «к прошлому периоду»), month — номер прошлого месяца (0…11).
 */
export function previousRange(
  preset: PeriodPreset,
  custom: CustomRange,
  now = new Date(),
  timeZone = browserTimeZone(),
): { range: DateRange; vs: 'week' | 'month' | 'custom'; month: number } | null {
  const at = (day: string) => zonedMidnight(day, timeZone).toISOString()
  const today = zonedParts(now.toISOString(), timeZone)
  const monthOf = (day: string) => Number(day.slice(5, 7)) - 1
  switch (preset) {
    case 'week': {
      const from = addDays(today.date, -today.weekday)
      const prev = addDays(from, -7)
      return { range: { from: at(prev), to: at(from) }, vs: 'week', month: monthOf(prev) }
    }
    case 'month': {
      const first = `${today.date.slice(0, 7)}-01`
      const prev = prevMonth(first)
      return { range: { from: at(prev), to: at(first) }, vs: 'month', month: monthOf(prev) }
    }
    case 'custom': {
      if (!custom.from || !custom.to) return null
      const from = addDays(custom.from, -daysInRange(custom))
      return { range: { from: at(from), to: at(custom.from) }, vs: 'custom', month: monthOf(from) }
    }
    default:
      return null
  }
}

/* ---------- Выбор своего диапазона в календаре ---------- */

const pad = (n: number) => String(n).padStart(2, '0')

/** Date → 'YYYY-MM-DD' (локальная дата) */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 'YYYY-MM-DD' → Date (полночь по местному времени) */
export function parseYmd(s: string): Date {
  return new Date(`${s}T00:00`)
}

export type QuickRange = 'today' | 'yesterday' | 'last7' | 'last30' | 'thisMonth' | 'lastMonth' | 'last90' | 'thisYear'
export const QUICK_RANGES: QuickRange[] = ['today', 'yesterday', 'last7', 'last30', 'thisMonth', 'lastMonth', 'last90', 'thisYear']

/** Быстрые варианты: «последние N дней» включают сегодня */
export function quickRange(key: QuickRange, now = new Date(), timeZone?: string): CustomRange {
  // «сегодня» — в поясе пользователя, если он задан (иначе — по часам браузера)
  const base = timeZone ? parseYmd(zonedParts(now.toISOString(), timeZone).date) : now
  const y = base.getFullYear()
  const m = base.getMonth()
  const d = base.getDate()
  const day = (offset: number) => ymd(new Date(y, m, d + offset))
  switch (key) {
    case 'today':
      return { from: day(0), to: day(0) }
    case 'yesterday':
      return { from: day(-1), to: day(-1) }
    case 'last7':
      return { from: day(-6), to: day(0) }
    case 'last30':
      return { from: day(-29), to: day(0) }
    case 'last90':
      return { from: day(-89), to: day(0) }
    case 'thisMonth':
      return { from: ymd(new Date(y, m, 1)), to: day(0) }
    case 'lastMonth':
      return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)) }
    case 'thisYear':
      return { from: ymd(new Date(y, 0, 1)), to: day(0) }
  }
}

/** Сетка месяца для календаря: 6 недель с понедельника (42 дня, включая хвосты соседних месяцев) */
export function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const shift = (first.getDay() + 6) % 7 // понедельник = 0
  return Array.from({ length: 42 }, (_, i) => new Date(year, month, 1 - shift + i))
}

/** Сколько дней в диапазоне (включительно) */
export function daysInRange(r: CustomRange): number {
  if (!r.from || !r.to) return 0
  return Math.round((parseYmd(r.to).getTime() - parseYmd(r.from).getTime()) / 86_400_000) + 1
}
