/** Разбор значений из ячеек CSV: числа в разных форматах, даты, смещение часового пояса. */

/**
 * Число из ячейки: «1234.5», «1,234.50», «1 234,5», «-0.012 USDT», «+12%».
 * Пусто, «--», «N/A» → null.
 */
export function parseNumberCell(raw: string | undefined): number | null {
  if (raw === undefined) return null
  let s = raw.trim().replace(/[\s  ]/g, '')
  if (s === '' || /^(-+|n\/?a|null|none|—)$/i.test(s)) return null
  s = s.replace(/\u2212/g, '-') // типографский минус «−»
  s = s.replace(/^[^\d+\-.,]+|[^\d.,]+$/g, '') // валюта / % по краям
  s = s.replace(/^\+/, '')
  const lastDot = s.lastIndexOf('.')
  const lastComma = s.lastIndexOf(',')
  if (lastDot !== -1 && lastComma !== -1) {
    // десятичный — тот разделитель, что правее
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (lastComma !== -1) {
    // только запятые: «1,234,567» — тысячи; «0,5» / «12,3456» — десятичная
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) && !/^-?0,/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.')
  }
  if (!/^-?\d*\.?\d+(e[-+]?\d+)?$/i.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Смещение из заголовка вида «Trade Time(UTC+3)» / «UTC-05:30», в минутах. null — не указано. */
export function offsetFromHeader(header: string): number | null {
  const m = /UTC\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?/i.exec(header)
  if (!m) return /\bUTC\b/i.test(header) ? 0 : null
  const minutes = Number(m[2]) * 60 + Number(m[3] ?? 0)
  return m[1] === '-' ? -minutes : minutes
}

/**
 * Дата/время из ячейки → ISO (UTC).
 * Понимает: 2026-11-03 14:05[:06], 2026/11/03 14:05, 03.11.2026 14:05, 11/03/2026 14:05 (м/д/г),
 * ISO с «Z» или смещением, unix-время в секундах и миллисекундах.
 * offsetMinutes — пояс, в котором записано время без явного смещения (UTC+3 → 180).
 */
export function parseDateCell(raw: string | undefined, offsetMinutes = 0): string | null {
  if (!raw) return null
  const s = raw.trim()
  if (s === '') return null

  if (/^\d{10}(\d{3})?$/.test(s)) {
    const ms = s.length === 13 ? Number(s) : Number(s) * 1000
    return new Date(ms).toISOString()
  }

  // Явный часовой пояс в самой строке — доверяем ему
  if (/T.*(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const d = new Date(s)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }

  let y: number, mo: number, d: number
  let rest: string
  let m: RegExpExecArray | null
  // сначала время, потом дата (Bybit UTA: «12:00 2026-11-05»)
  const timeFirst = /^(\d{1,2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:\s*[AP]M)?)\s+(\S+)$/i.exec(s)
  if (timeFirst) return parseDateCell(`${timeFirst[2]} ${timeFirst[1]}`, offsetMinutes)
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(.*)$/.exec(s))) {
    ;[y, mo, d, rest] = [Number(m[1]), Number(m[2]), Number(m[3]), m[4]]
  } else if ((m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(.*)$/.exec(s))) {
    ;[d, mo, y, rest] = [Number(m[1]), Number(m[2]), Number(m[3]), m[4]]
  } else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(.*)$/.exec(s))) {
    // a/b/yyyy: если первое число > 12 — это день (д/м), иначе м/д (американский формат)
    const a = Number(m[1])
    const b = Number(m[2])
    ;[d, mo] = a > 12 ? [a, b] : [b, a]
    y = Number(m[3])
    rest = m[4]
  } else return null

  const t = /^[T\s,]*(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?\s*(AM|PM)?\s*$/i.exec(rest)
  if (rest.trim() !== '' && !t) return null
  let hh = t ? Number(t[1]) : 0
  const mm = t ? Number(t[2]) : 0
  const ss = t?.[3] ? Number(t[3]) : 0
  const msec = t?.[4] ? Number(t[4].padEnd(3, '0')) : 0
  const ampm = t?.[5]?.toUpperCase()
  if (ampm === 'PM' && hh < 12) hh += 12
  if (ampm === 'AM' && hh === 12) hh = 0

  if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mm > 59 || ss > 59) return null
  const utc = Date.UTC(y, mo - 1, d, hh, mm, ss, msec) - offsetMinutes * 60_000
  const check = new Date(Date.UTC(y, mo - 1, d))
  if (check.getUTCDate() !== d) return null // 31.02 и т.п.
  return new Date(utc).toISOString()
}

/** Короткий стабильный хэш строки (FNV-1a 32 бита ×2) — для id строк без Order ID. */
export function stableHash(s: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193)
    h2 = Math.imul(h2 ^ c, 0x5bd1e995)
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36)
}
