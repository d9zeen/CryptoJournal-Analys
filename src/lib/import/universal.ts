/** Общий движок импорта для всех бирж: сам понимает, что в файле — закрытые позиции или история исполнений. */
import { FIELDS, sideMeaningFromHeader, type ImportField, type SideMeaning } from './fields'
import { parsePositions } from './positions'
import { parseFills } from './fills'
import type { ColumnMapping } from './mapping'
import type { ImportMode, ImportParser } from './types'

const REQUIRED: Record<ImportMode, (ImportField | ImportField[])[]> = {
  positions: ['symbol', 'side', ['qty', 'entryValue'], 'entryPrice', 'exitPrice', 'closeTime'],
  fills: ['symbol', 'side', ['qty', 'value'], 'price', 'closeTime'],
}

export function detectMode(mapping: ColumnMapping<string>): ImportMode | null {
  if (mapping.entryPrice >= 0 || mapping.exitPrice >= 0) return 'positions'
  if (mapping.price >= 0) return 'fills'
  return null
}

export function makeParser(exchange: string, sideMeaning: SideMeaning): ImportParser {
  const required = (mode: ImportMode | null) => REQUIRED[mode ?? 'positions'].map((r) => (Array.isArray(r) ? r[0] : r))
  return {
    exchange,
    fields: FIELDS,
    timeField: 'closeTime',
    mode: detectMode,
    required,
    missing(mapping) {
      const mode = detectMode(mapping) ?? 'positions'
      return REQUIRED[mode]
        .filter((r) => (Array.isArray(r) ? r.every((f) => mapping[f] < 0) : mapping[r] < 0))
        .map((r) => (Array.isArray(r) ? r[0] : r))
    },
    parse(table, mapping, options) {
      if (detectMode(mapping) === 'fills') return parseFills(table, mapping, options, exchange)
      const meaning = sideMeaningFromHeader(mapping.side >= 0 ? table.headers[mapping.side] : undefined, sideMeaning)
      return parsePositions(table, mapping, options, exchange, meaning)
    },
  }
}
