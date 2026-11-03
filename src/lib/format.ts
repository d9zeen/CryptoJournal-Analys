/** Форматирование чисел и дат для интерфейса. */
const LOCALE = 'ru-RU'

const usd = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 1 234,56 $ */
export function formatUsd(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : usd.format(n)
}

/** +1 234,56 $ / −12,00 $ */
export function formatPnl(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  const s = usd.format(Math.abs(n))
  return n > 0 ? `+${s}` : n < 0 ? `−${s}` : s
}

/** Цена: до 8 знаков, без лишних нулей. */
export function formatPrice(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  const digits = n >= 1000 ? 2 : n >= 1 ? 4 : 8
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: digits }).format(n)
}

export function formatNumber(n: number | null | undefined, maxDigits = 2): string {
  if (n === null || n === undefined) return '—'
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: maxDigits }).format(n)
}

/** +1,25R */
export function formatR(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  const s = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n))
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${s}R`
}

/** 03.11.2026, 14:05 (в часовом поясе браузера) */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso))
}

/** ISO → значение для <input type="datetime-local"> в локальном времени */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** <input type="datetime-local"> → ISO (UTC) */
export function localInputToIso(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Класс цвета для PnL */
export function pnlClass(n: number | null | undefined): string {
  if (n === null || n === undefined || n === 0) return 'text-muted'
  return n > 0 ? 'text-profit' : 'text-loss'
}
