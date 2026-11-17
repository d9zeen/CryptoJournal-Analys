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

/** Сдвиг пояса в момент t: местное время пояса минус UTC, мс */
function offsetMs(t: number, timeZone: string): number {
  let f = offsetCache.get(timeZone)
  if (!f) {
    const opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }
    try {
      f = new Intl.DateTimeFormat('en-US', { ...opts, timeZone })
    } catch {
      f = new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' })
    }
    offsetCache.set(timeZone, f)
  }
  const p = Object.fromEntries(f.formatToParts(new Date(t)).map((x) => [x.type, x.value]))
  const wall = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second))
  return wall - Math.floor(t / 1000) * 1000
}
const offsetCache = new Map<string, Intl.DateTimeFormat>()

/**
 * Полночь дня 'YYYY-MM-DD' в поясе пользователя → момент (UTC).
 * Границы «этой недели», «этого месяца», своего диапазона и «дня из календаря» — по тому же поясу, что и сами дни
 * (zonedParts): иначе сделка около полуночи попадала бы в календаре в один день, а в списке и «Статистике» — в другой.
 */
export function zonedMidnight(day: string, timeZone: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d)
  const first = offsetMs(guess, timeZone)
  let t = guess - first
  const second = offsetMs(t, timeZone)
  if (second !== first) t = guess - second // переход на летнее / зимнее время в эти сутки
  return new Date(t)
}

/** 'YYYY-MM-DD' + n дней (календарная арифметика, без часовых поясов) */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}
