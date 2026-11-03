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
