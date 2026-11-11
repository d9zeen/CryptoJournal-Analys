/**
 * Форматирование чисел и дат для интерфейса — по языку (src/lib/locale.ts):
 * en — $1,234.56, Nov 3; ru — 1 234,56 $, 03.11.
 */
import { getLang, intlLocale } from './locale'

/** Intl.NumberFormat с кэшем по языку и настройкам — не создавать заново на каждое число */
const cache = new Map<string, Intl.NumberFormat>()
function nf(opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const locale = intlLocale()
  const key = locale + JSON.stringify(opts)
  let f = cache.get(key)
  if (!f) cache.set(key, (f = new Intl.NumberFormat(locale, opts)))
  return f
}
const usd = () => nf({ style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 1 234,56 $ (ru) · $1,234.56 (en) */
export function formatUsd(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : usd().format(n)
}

/** +1 234,56 $ / −12,00 $ */
export function formatPnl(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  const s = usd().format(Math.abs(n))
  return n > 0 ? `+${s}` : n < 0 ? `−${s}` : s
}

/** Цена: до 8 знаков, без лишних нулей. */
export function formatPrice(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  const abs = Math.abs(n)
  // дешёвые монеты (PEPE, SHIB): считаем значащие цифры, а не знаки после запятой — иначе 0,0000012345 → 0,00000123
  if (abs > 0 && abs < 1) return nf({ maximumSignificantDigits: 6 }).format(n)
  return nf({ maximumFractionDigits: abs >= 1000 ? 2 : 4 }).format(n)
}

export function formatNumber(n: number | null | undefined, maxDigits = 2): string {
  if (n === null || n === undefined) return '—'
  return nf({ maximumFractionDigits: maxDigits }).format(n)
}

/** +1,25R */
export function formatR(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  const s = nf({ minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n))
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${s}R`
}

/** 03.11.2026, 14:05 (в часовом поясе браузера) */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat(intlLocale(), { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso))
}

/** Дата без времени: 12.12.2026 (в часовом поясе браузера) */
export function formatDateShort(d: Date | string): string {
  return new Intl.DateTimeFormat(intlLocale(), { dateStyle: 'short' }).format(typeof d === 'string' ? new Date(d) : d)
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

/** 0.523 → 52,3 % */
export function formatPercent(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined) return '—'
  return nf({ style: 'percent', maximumFractionDigits: digits }).format(n)
}

/** Profit factor: 1,85 · ∞ · — */
export function formatRatio(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  if (n === Infinity) return '∞'
  return nf({ minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

/** Короткая сумма для осей графиков: 1,2 тыс. $ (ru) · $1.2K (en) */
export function formatUsdShort(n: number): string {
  return nf({ style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** YYYY-MM-DD → 03.11 (ru) · Nov 3 (en) */
export function formatDayShort(date: string): string {
  const [, m, d] = date.split('-')
  return getLang() === 'en' ? `${MONTHS_EN[Number(m) - 1]} ${Number(d)}` : `${d}.${m}`
}

/** YYYY-MM-DD → 03.11.2026 (ru) · Nov 3, 2026 (en) */
export function formatDay(date: string): string {
  const [y, m, d] = date.split('-')
  return getLang() === 'en' ? `${MONTHS_EN[Number(m) - 1]} ${Number(d)}, ${y}` : `${d}.${m}.${y}`
}
