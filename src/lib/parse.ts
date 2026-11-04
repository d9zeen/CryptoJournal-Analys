/** Число из поля ввода: понимает запятую, пробелы, «1 234,5». Пусто/мусор → null. */
export function parseDecimal(input: string | null | undefined): number | null {
  if (input === null || input === undefined) return null
  let cleaned = input.replace(/[\s\u00a0\u202f]/g, '').replace(/\u2212/g, '-')
  const lastDot = cleaned.lastIndexOf('.')
  const lastComma = cleaned.lastIndexOf(',')
  // и точка, и запятая: десятичный — тот, что правее («1,234.5» и «1.234,5»), второй — разделитель тысяч
  if (lastDot !== -1 && lastComma !== -1) {
    cleaned = lastComma > lastDot ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned.replace(/,/g, '')
  } else cleaned = cleaned.replace(',', '.')
  if (cleaned === '' || !/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(cleaned)) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/** Число → строка для поля ввода (без лишних нулей). */
export function toInput(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return ''
  return String(Number(n.toPrecision(15)))
}
