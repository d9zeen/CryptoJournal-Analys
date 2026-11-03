/** Подготовка импорта: файл → строки → что вставляем, что пропускаем и почему. */
import { parseCsv, type CsvTable } from './csv'
import { autoMap, type ColumnMapping } from './mapping'
import { missingFields, type ImportedTrade, type ImportParser, type ParsedRow } from './types'
import { offsetFromHeader } from './values'

export type Prepared = {
  table: CsvTable
  mapping: ColumnMapping<string>
  /** часовой пояс времени в файле, минуты от UTC */
  utcOffsetMinutes: number
  /** пояс найден в заголовке файла (иначе — предположили UTC) */
  offsetDetected: boolean
  missing: string[]
  rows: ParsedRow[]
}

/** Разобрать текст файла. mapping / offset — ручные поправки пользователя (иначе автоопределение). */
export function prepareImport(
  text: string,
  parser: ImportParser,
  overrides: { mapping?: ColumnMapping<string>; utcOffsetMinutes?: number } = {},
): Prepared {
  const table = parseCsv(text)
  const mapping = overrides.mapping ?? autoMap(table.headers, parser.fields)
  const timeCol = mapping[parser.timeField]
  const fromHeader = timeCol >= 0 ? offsetFromHeader(table.headers[timeCol]) : null
  const utcOffsetMinutes = overrides.utcOffsetMinutes ?? fromHeader ?? 0
  const missing = missingFields(parser, mapping)
  const rows = missing.length ? [] : parser.parse(table, mapping, { utcOffsetMinutes })
  return { table, mapping, utcOffsetMinutes, offsetDetected: fromHeader !== null, missing, rows }
}

export type RowStatus = 'new' | 'duplicate' | 'error' | 'overLimit'

export type ImportPlan = {
  /** что вставить — в хронологическом порядке (по выходу) */
  toInsert: ImportedTrade[]
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
  const fresh: ParsedRow[] = []
  for (const r of rows) {
    if (!r.trade) status.set(r.line, 'error')
    else if (existingIds.has(r.trade.external_id)) status.set(r.line, 'duplicate')
    else fresh.push(r)
  }
  fresh.sort((a, b) => a.trade!.exit_at.localeCompare(b.trade!.exit_at) || a.line - b.line)
  const cap = remaining === null ? fresh.length : Math.max(0, remaining)
  fresh.forEach((r, i) => status.set(r.line, i < cap ? 'new' : 'overLimit'))

  const counts: Record<RowStatus, number> = { new: 0, duplicate: 0, error: 0, overLimit: 0 }
  for (const s of status.values()) counts[s]++
  return { toInsert: fresh.slice(0, cap).map((r) => r.trade!), status, counts }
}
