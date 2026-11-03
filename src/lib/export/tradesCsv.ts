/**
 * Выгрузка сделок в CSV — резервная копия и разбор в Excel / Google Таблицах.
 * Разделитель «;» (его русский Excel открывает по колонкам), UTF-8 с BOM, время — ISO в UTC,
 * числа — с точкой (так их понимает и наш импорт, и любая программа).
 */
import type { TradeWithTags } from '@/types/db'

export type NameLookups = {
  setups: ReadonlyMap<string, string>
  emotions: ReadonlyMap<string, string>
  tags: ReadonlyMap<string, string>
}

const DELIM = ';'

export const CSV_COLUMNS = [
  'id', 'exchange', 'market_type', 'symbol', 'side', 'entry_at', 'exit_at',
  'entry_price', 'exit_price', 'size_usd', 'leverage', 'fee', 'funding',
  'stop_loss', 'take_profit', 'pnl', 'pnl_manual', 'r_multiple',
  'setup', 'emotion', 'mistakes', 'note', 'source', 'external_id', 'created_at',
] as const

/** Ячейка CSV: кавычки при необходимости; текст, похожий на формулу (=, +, @), экранируем апострофом. */
export function csvCell(value: unknown, isText = false): string {
  if (value === null || value === undefined) return ''
  let s = String(value)
  if (isText && /^[=+@\t\r]/.test(s)) s = `'${s}`
  if (isText && /^-/.test(s) && !/^-?\d/.test(s)) s = `'${s}`
  return /[";\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function tradesToCsv(trades: TradeWithTags[], names: NameLookups): string {
  const name = (map: ReadonlyMap<string, string>, id: string | null) => (id ? (map.get(id) ?? '') : '')
  const lines = [CSV_COLUMNS.join(DELIM)]
  for (const t of trades) {
    const mistakes = t.trade_mistakes.map((m) => names.tags.get(m.tag_id) ?? '').filter(Boolean).join(' | ')
    const row: [unknown, boolean][] = [
      [t.id, false], [t.exchange, true], [t.market_type, false], [t.symbol, true], [t.side, false],
      [t.entry_at, false], [t.exit_at, false],
      [t.entry_price, false], [t.exit_price, false], [t.size_usd, false], [t.leverage, false], [t.fee, false], [t.funding, false],
      [t.stop_loss, false], [t.take_profit, false], [t.pnl, false], [t.pnl_manual, false], [t.r_multiple, false],
      [name(names.setups, t.setup_id), true], [name(names.emotions, t.emotion_id), true], [mistakes, true],
      [t.note, true], [t.source, false], [t.external_id, true], [t.created_at, false],
    ]
    lines.push(row.map(([v, text]) => csvCell(v, text)).join(DELIM))
  }
  return '﻿' + lines.join('\r\n') + '\r\n'
}

/** Имя файла: cryptojournal-trades-2026-11-03.csv (дата по часам браузера) */
export function exportFilename(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `cryptojournal-trades-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.csv`
}
