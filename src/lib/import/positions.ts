/**
 * Закрытые позиции: одна строка = одна закрытая позиция
 * (Bybit Closed P&L, OKX / BingX / Bitget Position History и похожие).
 */
import { grossPnl, round } from '@/lib/calc/trade'
import { parseDateCell, parseNumberCell, stableHash } from './values'
import { feeCoinOf, feeToUsd, marketOf, normalizeSymbol, positionSide, type ImportField, type SideMeaning } from './fields'
import type { CsvTable } from './csv'
import type { ColumnMapping } from './mapping'
import type { ImportedTrade, ParsedRow, ParseOptions, RowError, RowWarning } from './types'
import { finalPnl } from './pnl'

export function parsePositions(
  table: CsvTable,
  mapping: ColumnMapping<string>,
  { utcOffsetMinutes, market: marketChoice }: ParseOptions,
  exchange: string,
  sideMeaning: SideMeaning,
): ParsedRow[] {
  const seen = new Map<string, number>()
  const has = (f: ImportField) => mapping[f] >= 0
  return table.rows.map((row, i): ParsedRow => {
    const line = i + 2
    const cell = (f: ImportField) => (has(f) ? row[mapping[f]] : undefined)
    const n = (f: ImportField) => parseNumberCell(cell(f))
    const fail = (error: RowError, detail?: string): ParsedRow => ({ line, trade: null, error, detail, warnings: [] })
    const warnings: RowWarning[] = []

    const symbol = normalizeSymbol(cell('symbol'))
    if (!symbol) return fail('symbol')
    const side = positionSide(cell('side'), sideMeaning)
    if (!side) return fail('side', cell('side'))
    const entryPrice = n('entryPrice')
    if (entryPrice === null || entryPrice <= 0) return fail('entryPrice')
    const exitPrice = n('exitPrice')
    if (exitPrice === null || exitPrice <= 0) return fail('exitPrice')

    const market = marketChoice === 'auto' ? marketOf(symbol) : marketChoice
    if (market === 'spot' && side === 'short') return fail('side')
    // Инверсные: объём — в контрактах по 1 $, PnL и комиссии — в монете (переводим в $ по цене выхода)
    const coinToUsd = market === 'inverse' ? exitPrice : 1
    const qty = n('qty')
    const entryValue = n('entryValue')
    const sizeUsd =
      market === 'inverse'
        ? Math.abs(qty ?? entryValue ?? 0)
        : entryValue !== null && entryValue !== 0
          ? Math.abs(entryValue)
          : Math.abs(qty ?? 0) * entryPrice
    if (!(sizeUsd > 0)) return fail('size')

    const exitAt = parseDateCell(cell('closeTime'), utcOffsetMinutes)
    if (!exitAt) return fail('time')
    let entryAt = exitAt
    if (has('openTime')) {
      const parsed = parseDateCell(cell('openTime'), utcOffsetMinutes)
      if (!parsed) return fail('time')
      entryAt = parsed
    } else warnings.push('noEntryTime')
    if (entryAt > exitAt) return fail('time')

    const funding = (n('funding') ?? 0) * coinToUsd
    const pnlFile = n('pnl')
    const gross = grossPnl({ marketType: market, side, entryPrice, exitPrice, sizeUsd })!

    // Комиссии — расход, храним положительным числом, в $
    const hasFeeCols = has('openFee') || has('closeFee') || has('fee')
    let fee = 0
    if (hasFeeCols) {
      const raw = has('openFee') || has('closeFee') ? Math.abs(n('openFee') ?? 0) + Math.abs(n('closeFee') ?? 0) : Math.abs(n('fee') ?? 0)
      const coin = feeCoinOf(cell('fee') ?? cell('openFee'), cell('feeCoin'))
      const usd = feeToUsd(raw, coin, symbol, exitPrice, market)
      if (usd === null) warnings.push('feeNotUsd')
      else fee = usd
    } else if (pnlFile !== null) {
      const derived = gross + funding - pnlFile * coinToUsd
      if (derived > 0) {
        fee = derived
        warnings.push('feeDerived')
      }
    }

    const { pnl, pnlManual } = finalPnl({ gross, fee, funding, filePnl: pnlFile !== null ? pnlFile * coinToUsd : null, sizeUsd })
    if (pnlManual) warnings.push('pnlFromFile')

    const leverageRaw = n('leverage')
    const leverage = market === 'spot' ? 1 : leverageRaw !== null && leverageRaw >= 1 ? Math.min(leverageRaw, 1000) : 1

    // id: Order ID с биржи, иначе отпечаток строки. Одинаковые строки внутри файла различаем суффиксом.
    const orderId = (cell('orderId') ?? '').trim()
    const baseId = orderId ? `o:${orderId}` : `h:${stableHash([symbol, side, exitAt, entryAt, entryPrice, exitPrice, sizeUsd, pnl].join('|'))}`
    const dup = (seen.get(baseId) ?? 0) + 1
    seen.set(baseId, dup)

    const trade: ImportedTrade = {
      exchange,
      market_type: market,
      symbol,
      side,
      entry_at: entryAt,
      exit_at: exitAt,
      entry_price: entryPrice,
      exit_price: exitPrice,
      size_usd: round(sizeUsd, 8),
      leverage: round(leverage, 2),
      fee: round(fee, 8),
      funding: round(funding, 8),
      pnl: round(pnl, 8),
      pnl_manual: pnlManual,
      external_id: (dup > 1 ? `${baseId}#${dup}` : baseId).slice(0, 200),
    }
    return { line, trade, error: null, warnings }
  })
}
