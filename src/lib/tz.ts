/** Разбор момента времени (UTC) на части в часовом поясе пользователя. */
export type ZonedParts = {
  /** YYYY-MM-DD в поясе пользователя */
  date: string
  /** 0–23 */
  hour: number
  /** 0 = понедельник … 6 = воскресенье */
  weekday: number
}

const WEEKDAYS: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }
const cache = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = cache.get(timeZone)
  if (!f) {
    const opts: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
    }
    try {
      f = new Intl.DateTimeFormat('en-US', { ...opts, timeZone })
    } catch {
      // неизвестный пояс — считаем в UTC, чтобы не падать
      f = new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' })
    }
    cache.set(timeZone, f)
  }
  return f
}

export function zonedParts(iso: string, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(new Date(iso))
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour')) % 24,
    weekday: WEEKDAYS[get('weekday')] ?? 0,
  }
}

/** Часовой пояс браузера — запасной вариант, если в профиле пусто. */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}
