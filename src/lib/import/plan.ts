/** Подготовка импорта: файл → строки → что вставляем, что пропускаем и почему. */
import { parseCsv, type CsvTable } from './csv'
import { autoMap, type ColumnMapping } from './mapping'
import { FUZZY } from './fields'
import type { ImportedTrade, ImportMode, ImportParser, MarketChoice, ParsedRow } from './types'
import { offsetFromHeader } from './values'

export type Prepared = {
  table: CsvTable
  mapping: ColumnMapping<string>
  /** часовой пояс времени в файле, минуты от UTC */
  utcOffsetMinutes: number
  /** пояс найден в заголовке файла (иначе — предположили UTC) */
  offsetDetected: boolean
  missing: string[]
  /** вид выгрузки: закрытые позиции или история исполнений */
  mode: ImportMode | null
  rows: ParsedRow[]
}

/** Разобрать текст файла. mapping / offset — ручные поправки пользователя (иначе автоопределение). */
export function prepareImport(
  source: string | CsvTable,
  parser: ImportParser,
  overrides: { mapping?: ColumnMapping<string>; utcOffsetMinutes?: number; market?: MarketChoice } = {},
): Prepared {
  const table = typeof source === 'string' ? parseCsv(source) : source
  const mapping = overrides.mapping ?? autoMap(table.headers, parser.fields, FUZZY)
  const timeCol = mapping[parser.timeField]
  const fromHeader = timeCol >= 0 ? offsetFromHeader(table.headers[timeCol]) : null
  const utcOffsetMinutes = overrides.utcOffsetMinutes ?? fromHeader ?? 0
  const missing = parser.missing(mapping)
  const mode = parser.mode(mapping)
  const rows = missing.length ? [] : parser.parse(table, mapping, { utcOffsetMinutes, market: overrides.market ?? 'auto' })
  return { table, mapping, utcOffsetMinutes, offsetDetected: fromHeader !== null, missing, mode, rows }
}

export type RowStatus = 'new' | 'duplicate' | 'error' | 'overLimit'

export type ImportPlan = {
  /** что вставить — в хронологическом порядке (по выходу) */
  toInsert: ImportedTrade[]
  /** статус по индексу строки в prepared.rows */
  status: Map<number, RowStatus>
  counts: Record<RowStatus, number>
}

/**
 * existingIds — external_id сделок этой биржи, которые уже есть у пользователя.
 * remaining — сколько ещё сделок можно создать в этом месяце (null — без лимита).
 * Если всё не влезает в лимит, берём самые старые: так история заполняется без дыр.
 */
export function planImport(rows: ParsedRow[], existingIds: ReadonlySet<string>, remaining: number | null): ImportPlan {
  const status = new Map<number, RowStatus>()
  const fresh: { r: ParsedRow; i: number }[] = []
  rows.forEach((r, i) => {
    if (!r.trade) status.set(i, 'error')
    else if (existingIds.has(r.trade.external_id)) status.set(i, 'duplicate')
    else fresh.push({ r, i })
  })
  fresh.sort((a, b) => a.r.trade!.exit_at.localeCompare(b.r.trade!.exit_at) || a.r.line - b.r.line)
  const cap = remaining === null ? fresh.length : Math.max(0, remaining)
  fresh.forEach(({ i }, k) => status.set(i, k < cap ? 'new' : 'overLimit'))

  const counts: Record<RowStatus, number> = { new: 0, duplicate: 0, error: 0, overLimit: 0 }
  for (const s of status.values()) counts[s]++
  return { toInsert: fresh.slice(0, cap).map(({ r }) => r.trade!), status, counts }
}
