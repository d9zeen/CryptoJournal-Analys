/** Сопоставление колонок файла с полями импорта по названиям (синонимам). */

/** Заголовок → ключ для сравнения: без регистра, скобок «(UTC+0)», пробелов и знаков. */
export function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\([^)]*\)/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
}

/** Поле → индекс колонки (−1 = не найдено) */
export type ColumnMapping<F extends string> = Record<F, number>

/**
 * Автосопоставление: для каждого поля — первая колонка, чьё название совпадает с одним из синонимов.
 * Одна колонка не может достаться двум полям (приоритет — у поля, объявленного раньше).
 */
export function autoMap<F extends string>(
  headers: string[],
  aliases: Record<F, readonly string[]>,
  fuzzy: Partial<Record<F, { words: string[]; prefer: string[]; avoid: string[] }>> = {},
): ColumnMapping<F> {
  const norm = headers.map(normalizeHeader)
  const used = new Set<number>()
  const out = {} as ColumnMapping<F>
  for (const field of Object.keys(aliases) as F[]) {
    const keys = aliases[field].map(normalizeHeader)
    let idx = -1
    // сначала ищем по порядку синонимов: более точные синонимы идут первыми
    for (const k of keys) {
      idx = norm.findIndex((h, i) => h === k && !used.has(i))
      if (idx !== -1) break
    }
    if (idx !== -1) used.add(idx)
    out[field] = idx
  }
  // запасной поиск по слову в названии — только для оставшихся полей и свободных колонок
  for (const field of Object.keys(fuzzy) as F[]) {
    const rule = fuzzy[field]
    if (!rule || out[field] !== -1) continue
    let best = -1
    let bestScore = -Infinity
    norm.forEach((h, i) => {
      if (used.has(i) || !rule.words.some((w) => h.includes(w))) return
      const score = (rule.prefer.some((w) => h.includes(w)) ? 1 : 0) - (rule.avoid.some((w) => h.includes(w)) ? 2 : 0)
      if (score > bestScore) {
        best = i
        bestScore = score
      }
    })
    if (best !== -1) {
      used.add(best)
      out[field] = best
    }
  }
  return out
}
