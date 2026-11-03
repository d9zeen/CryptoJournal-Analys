/** Число из поля ввода: понимает запятую, пробелы, «1 234,5». Пусто/мусор → null. */
export function parseDecimal(input: string | null | undefined): number | null {
  if (input === null || input === undefined) return null
  const cleaned = input.replace(/[\s ]/g, '').replace(',', '.')
  if (cleaned === '' || !/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(cleaned)) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/** Число → строка для поля ввода (без лишних нулей). */
export function toInput(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return ''
  return String(Number(n.toPrecision(15)))
}
