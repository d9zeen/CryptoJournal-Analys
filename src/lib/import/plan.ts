/** Подготовка импорта: файл → строки → что вставляем, что пропускаем и почему. */
import { parseCsv, type CsvTable } from './csv'
import { autoMap, type ColumnMapping } from './mapping'
import { FUZZY, bareSide, fillSign } from './fields'
import type { ImportedTrade, ImportMode, ImportParser, MarketChoice, ParsedRow, SideFallback } from './types'
import { offsetFromHeader, parseNumberCell } from './values'

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
  /** как понято направление, если в файле только «Long» / «Short» (null — как обычно) */
  sideFallback: SideFallback | null
}

/** Разобрать текст файла. mapping / offset — ручные поправки пользователя (иначе автоопределение). */
export function prepareImport(
  source: string | CsvTable,
  parser: ImportParser,
  overrides: { mapping?: ColumnMapping<string>; utcOffsetMinutes?: number; market?: MarketChoice } = {},
): Prepared {
  const table = typeof source === 'string' ? parseCsv(source) : source
  const auto = !overrides.mapping
  let mapping = overrides.mapping ?? autoMap(table.headers, parser.fields, FUZZY)
  if (auto && parser.mode(mapping) === 'fills') mapping = repairSide(table, mapping)
  // Закрытые позиции: отдельной колонки направления нет, а «Trade Type» есть (Bybit Closed P&L) — направление в ней
  if (auto && parser.mode(mapping) === 'positions' && mapping.side < 0 && (mapping.sideHint ?? -1) >= 0) {
    mapping = { ...mapping, side: mapping.sideHint, sideHint: -1 }
  }
  const timeCol = mapping[parser.timeField]
  const fromHeader = timeCol >= 0 ? offsetFromHeader(table.headers[timeCol]) : null
  const utcOffsetMinutes = overrides.utcOffsetMinutes ?? fromHeader ?? 0
  const missing = parser.missing(mapping)
  const mode = parser.mode(mapping)
  const base = { utcOffsetMinutes, market: overrides.market ?? 'auto' } as const
  let rows = missing.length ? [] : parser.parse(table, mapping, base)
  let sideFallback: Prepared['sideFallback'] = null
  // История исполнений, где направление — просто «Long» / «Short»: пробуем понять его как покупку / продажу
  // или по знаку объёма и берём вариант, при котором позиции собираются (открываются и закрываются в ноль)
  if (mode === 'fills' && rows.length) {
    const sideErrors = rows.filter((r) => r.error === 'side').length
    if (sideErrors > rows.length / 2) {
      let best = { trades: 0, open: Infinity }
      let fallbackRows: ParsedRow[] | null = null
      // Long / Short как сторона позиции + закрытый PnL у каждого исполнения — самый надёжный вариант (Bybit UTA)
      // есть цена ордера: у покупки она не ниже цены исполнения — если «Long» почти всегда так, Long = покупка
      const vote = longIsBuyVote(table, mapping)
      const order: SideFallback[] =
        vote !== null && vote >= 0.95 ? ['longIsBuy'] : mapping.pnl >= 0 ? ['positionSide', 'qtySign', 'longIsBuy'] : ['qtySign', 'longIsBuy', 'positionSide']
      for (const fb of order) {
        const tryRows = parser.parse(table, mapping, { ...base, sideFallback: fb })
        if (tryRows.filter((r) => r.error === 'side').length > tryRows.length * 0.1) continue
        const trades = tryRows.filter((r) => r.trade).length
        const open = tryRows.filter((r) => r.error === 'stillOpen').length
        // позиций должно закрыться заметно больше, чем осталось открытыми
        if (trades > 0 && (trades >= open * 2 || order.length === 1) && trades > best.trades) {
          best = { trades, open }
          rows = tryRows
          sideFallback = fb
          if (fb === 'positionSide') break // по PnL открытие / закрытие известно точно — дальше не ищем
        }
        if (fb === 'positionSide') fallbackRows = tryRows
      }
      // ни один способ не собрал сделки: показываем разбор «Long / Short = сторона позиции» —
      // так видна настоящая причина (дата, цена, объём…), а не тысячи «непонятное направление»
      if (!sideFallback && fallbackRows) {
        rows = fallbackRows
        sideFallback = 'positionSide'
      }
    }
  }
  return { table, mapping, utcOffsetMinutes, offsetDetected: fromHeader !== null, missing, mode, rows, sideFallback }
}

/**
 * Доля исполнений, где «Long» / «Short» совпадает с покупкой / продажей по цене ордера
 * (покупка: цена ордера выше цены исполнения — защита рыночного ордера или лимит, исполненный не хуже).
 * null — сравнить не по чему.
 */
function longIsBuyVote(table: CsvTable, mapping: ColumnMapping<string>): number | null {
  if (mapping.orderPrice < 0 || mapping.price < 0 || mapping.side < 0) return null
  let agree = 0
  let total = 0
  for (const row of table.rows) {
    const dir = bareSide(row[mapping.side])
    const order = parseNumberCell(row[mapping.orderPrice])
    const fill = parseNumberCell(row[mapping.price])
    if (!dir || !order || !fill || order <= 0 || order === fill) continue
    total++
    if ((order > fill ? 1 : -1) === dir) agree++
  }
  return total >= 5 ? agree / total : null
}

/**
 * Направление в истории исполнений: если в найденной колонке значения непонятны,
 * ищем другую колонку, где они читаются (Buy / Sell), или колонку-подсказку
 * «открытие / закрытие», которая вместе с ней даёт направление («Long» + «Open»).
 */
function repairSide(table: CsvTable, mapping: ColumnMapping<string>): ColumnMapping<string> {
  const sample = table.rows.slice(0, 300).filter((r) => r.some((c) => c.trim() !== ''))
  if (!sample.length) return mapping
  const rate = (text: (row: string[]) => string) => sample.filter((r) => fillSign(text(r)) !== null).length / sample.length
  const at = (row: string[], i: number) => (i >= 0 ? (row[i] ?? '') : '')
  const s = mapping.side
  const h = mapping.sideHint ?? -1
  const current = (row: string[]) => (fillSign(at(row, s)) !== null ? at(row, s) : `${at(row, s)} ${at(row, h)}`)
  if (s >= 0 && rate(current) >= 0.9) return mapping
  const taken = new Set(Object.entries(mapping).filter(([f, i]) => i >= 0 && f !== 'side' && f !== 'sideHint').map(([, i]) => i))
  const cols = table.headers.map((_, i) => i).filter((i) => !taken.has(i) && i !== s)
  // 1) другая колонка сама по себе даёт направление
  for (const c of cols) if (rate((r) => at(r, c)) >= 0.9) return { ...mapping, side: c, sideHint: -1 }
  // 2) найденная колонка + колонка-подсказка
  if (s >= 0) for (const c of cols) if (rate((r) => `${at(r, s)} ${at(r, c)}`) >= 0.9) return { ...mapping, sideHint: c }
  return mapping
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
