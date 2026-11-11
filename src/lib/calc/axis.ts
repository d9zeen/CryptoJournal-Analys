/**
 * Пределы и деления оси Y по данным (кривая капитала): низ = min(минимум, 0) − запас, верх = максимум + запас,
 * запас ≈ 8 % размаха; деления — «круглые» числа (1, 2, 2,5, 5 × 10ⁿ) внутри диапазона.
 */
export type Axis = { lo: number; hi: number; ticks: number[] }

/** «Круглый» шаг не меньше raw: 1, 2, 2,5, 5, 10 × 10ⁿ */
export function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  const m = raw / p
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p
}

export function niceAxis(values: number[], { pad = 0.08, ticks = 4 }: { pad?: number; ticks?: number } = {}): Axis {
  const finite = values.filter(Number.isFinite)
  let min = Math.min(0, ...finite)
  let max = finite.length ? Math.max(...finite) : 0
  if (max === min) {
    // все значения одинаковые (или данных нет) — делаем диапазон вокруг них
    const d = Math.abs(max) || 1
    min -= d
    max += d
  }
  const span = max - min
  const lo0 = min === 0 ? 0 : min - span * pad // ноль — естественный низ, ниже не уходим
  const hi0 = max + span * pad
  const step = niceStep((hi0 - lo0) / ticks)
  const out: number[] = []
  for (let k = Math.ceil(lo0 / step - 1e-9); k <= Math.floor(hi0 / step + 1e-9); k++) out.push(k * step + 0)
  return { lo: lo0, hi: hi0, ticks: out }
}
