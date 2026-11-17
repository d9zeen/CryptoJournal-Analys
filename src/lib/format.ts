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

/** То, что после округления до digits знаков — ноль, считаем нулём: никаких «−0,00 $» и «-0 %» */
const zeroed = (n: number, digits: number) => (Math.round(Math.abs(n) * 10 ** digits) === 0 ? 0 : n)

/**
 * Часовой пояс для показа дат и времени — пояс из профиля (lib/useTimeZone ставит его, когда профиль загрузился),
 * иначе — браузера. Тот же пояс, что у дней в календаре и «Статистике»: время сделки и её день не расходятся.
 */
let displayTz: string | undefined
export function setDisplayTimeZone(tz: string | undefined): void {
  displayTz = tz || undefined
}
export const displayTimeZone = () => displayTz

/** 1 234,56 $ (ru) · $1,234.56 (en) */
export function formatUsd(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : usd().format(zeroed(n, 2))
}

/** Цена монеты в $: от 1 $ — с центами (95 000,00 $), дешевле — 4 значащими цифрами (0,00001234 $) */
export function formatUsdPrice(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  if (Math.abs(n) >= 1) return usd().format(n)
  return nf({ style: 'currency', currency: 'USD', maximumSignificantDigits: 4 }).format(n)
}

/** +1 234,56 $ / −12,00 $ */
export function formatPnl(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  const v = zeroed(n, 2)
  const s = usd().format(Math.abs(v))
  return v > 0 ? `+${s}` : v < 0 ? `−${s}` : s
}

/**
 * Короткая сумма для тесных мест (клетка дня в календаре): без копеек — +215 $ / +$215;
 * от 10 000 — тысячами с одним знаком: +12,4K $ / +$12.4K; от миллиона — +1,2M $. Полная сумма — в подсказке.
 */
export function formatPnlShort(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  const abs = Math.abs(n)
  const sign = Math.round(abs) === 0 ? '' : n > 0 ? '+' : '−'
  let num: string
  if (abs < 9999.5) num = nf({ maximumFractionDigits: 0 }).format(Math.round(abs))
  else if (abs < 999_950) num = `${nf({ maximumFractionDigits: 1 }).format(Math.round(abs / 100) / 10)}K`
  else num = `${nf({ maximumFractionDigits: 1 }).format(Math.round(abs / 100_000) / 10)}M`
  // где стоит знак доллара — как в формате языка (en: $215, ru: 215 $)
  const parts = usd().formatToParts(1)
  const cur = parts.find((p) => p.type === 'currency')?.value ?? '$'
  const prefix = parts[0]?.type === 'currency'
  return sign + (prefix ? `${cur}${num}` : `${num}\u00a0${cur}`)
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
  const v = zeroed(n, 2)
  const s = nf({ minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(v))
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${s}R`
}

/** 03.11.2026, 14:05 (в часовом поясе пользователя — displayTimeZone) */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat(intlLocale(), { dateStyle: 'short', timeStyle: 'short', timeZone: displayTz }).format(new Date(iso))
}

/**
 * Сколько длилась сделка: «45 мин», «4 ч 12 мин», «3 д 2 ч» (en: «45 min», «4 h 12 min», «3 d 2 h»).
 * Меньше минуты — «< 1 мин»; от суток — дни и часы (минуты уже не важны); null — открытая сделка («—»).
 */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return '—'
  const en = getLang() === 'en'
  const u = en ? { d: 'd', h: 'h', m: 'min', lt: '< 1 min' } : { d: 'д', h: 'ч', m: 'мин', lt: '< 1 мин' }
  const min = Math.floor(ms / 60_000)
  if (min < 1) return u.lt
  const d = Math.floor(min / 1440)
  const h = Math.floor((min % 1440) / 60)
  const m = min % 60
  if (d > 0) return h ? `${d} ${u.d} ${h} ${u.h}` : `${d} ${u.d}`
  if (h > 0) return m ? `${h} ${u.h} ${m} ${u.m}` : `${h} ${u.h}`
  return `${m} ${u.m}`
}

/** Только время 14:05 (ru) / 2:05 PM (en) — в часовом поясе пользователя (профиль) */
export function formatTimeIn(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(intlLocale(), { timeZone, timeStyle: 'short' }).format(new Date(iso))
}

/** Дата без времени: 12.12.2026 (в часовом поясе пользователя) */
export function formatDateShort(d: Date | string): string {
  return new Intl.DateTimeFormat(intlLocale(), { dateStyle: 'short', timeZone: displayTz }).format(typeof d === 'string' ? new Date(d) : d)
}

/** ISO → значение для <input type="datetime-local"> — время в поясе пользователя (как в списке и календаре) */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  if (!displayTz) {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: displayTz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  )
  return `${p.year}-${p.month}-${p.day}T${String(Number(p.hour) % 24).padStart(2, '0')}:${p.minute}`
}

/** <input type="datetime-local"> (время в поясе пользователя) → ISO (UTC) */
export function localInputToIso(value: string): string | null {
  if (!value) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value)
  if (!displayTz || !m) {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  // местное время пояса → UTC: полночь дня в поясе + часы и минуты (смещение пояса — на этот момент)
  const wall = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]))
  const guess = wall - tzOffset(wall, displayTz)
  const t = wall - tzOffset(guess, displayTz)
  return new Date(t).toISOString()
}

/** Смещение пояса в момент t (местное − UTC), мс */
function tzOffset(t: number, timeZone: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(t))
      .map((x) => [x.type, x.value]),
  )
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second)) - Math.floor(t / 1000) * 1000
}

/** Класс цвета для PnL */
export function pnlClass(n: number | null | undefined): string {
  if (n === null || n === undefined || n === 0) return 'text-muted'
  return n > 0 ? 'text-profit' : 'text-loss'
}

/** 0.523 → 52,3 % */
export function formatPercent(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined) return '—'
  return nf({ style: 'percent', maximumFractionDigits: digits }).format(zeroed(n, digits + 2))
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
