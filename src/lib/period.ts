import type { DateRange } from '@/features/trades/api'

export type PeriodPreset = 'week' | 'month' | 'all' | 'custom'
export type CustomRange = { from: string; to: string } // YYYY-MM-DD, включительно

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Диапазон дат для пресета (в локальном времени браузера). to — не включительно. */
export function rangeFor(preset: PeriodPreset, custom: CustomRange, now = new Date()): DateRange {
  switch (preset) {
    case 'week': {
      const day = (now.getDay() + 6) % 7 // понедельник = 0
      const from = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - day))
      const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7)
      return { from: from.toISOString(), to: to.toISOString() }
    }
    case 'month': {
      const from = new Date(now.getFullYear(), now.getMonth(), 1)
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      return { from: from.toISOString(), to: to.toISOString() }
    }
    case 'custom': {
      const from = custom.from ? new Date(`${custom.from}T00:00`) : null
      const toDay = custom.to ? new Date(`${custom.to}T00:00`) : null
      const to = toDay ? new Date(toDay.getFullYear(), toDay.getMonth(), toDay.getDate() + 1) : null
      return { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null }
    }
    default:
      return { from: null, to: null }
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
export function quickRange(key: QuickRange, now = new Date()): CustomRange {
  const y = now.getFullYear()
  const m = now.getMonth()
  const d = now.getDate()
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
