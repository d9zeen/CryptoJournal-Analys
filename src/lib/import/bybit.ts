/**
 * Bybit — экспорт «Closed P&L» (деривативы).
 * Одна строка = одно закрытие позиции: пара, сторона закрывающего ордера, объём,
 * средние цены входа и выхода, закрытый PnL (уже за вычетом комиссий), время.
 *
 * Названия колонок у Bybit менялись и зависят от языка, поэтому ищем по синонимам,
 * а пользователь может поправить сопоставление руками.
 */
import { grossPnl, round, type MarketType, type Side } from '@/lib/calc/trade'
import { parseDateCell, parseNumberCell, stableHash } from './values'
import type { ImportedTrade, ImportParser, ParsedRow, RowError, RowWarning } from './types'

const FIELDS = {
  orderId: ['Order ID', 'Order No', 'Order Number', 'OrderId', 'ID ордера', 'Номер ордера'],
  symbol: ['Contracts', 'Contract', 'Symbol', 'Instrument', 'Market', 'Trading Pair', 'Pair', 'Контракты', 'Контракт', 'Символ', 'Торговая пара', 'Пара', 'Инструмент'],
  side: ['Closing Direction', 'Close Direction', 'Direction', 'Side', 'Order Direction', 'Position Side', 'Trade Side', 'Направление закрытия', 'Направление', 'Сторона'],
  qty: ['Qty', 'Quantity', 'Closed Qty', 'Closed Size', 'Closed Quantity', 'Size', 'Кол-во', 'Количество', 'Закрытое количество', 'Объем', 'Объём'],
  entryValue: ['Entry Value', 'Cum Entry Value', 'Position Value', 'Стоимость входа', 'Стоимость позиции'],
  entryPrice: ['Entry Price', 'Avg Entry Price', 'Average Entry Price', 'Open Price', 'Цена входа', 'Средняя цена входа', 'Цена открытия'],
  exitPrice: ['Exit Price', 'Avg Exit Price', 'Average Exit Price', 'Close Price', 'Closing Price', 'Цена выхода', 'Средняя цена выхода', 'Цена закрытия'],
  pnl: ['Closed P&L', 'Closed PnL', 'Realized P&L', 'Realized PnL', 'Realised P&L', 'Realised PnL', 'P&L', 'PnL', 'Закрытый P&L', 'Закрытые P&L', 'Закрытый PnL', 'Реализованный P&L', 'Реализованный PnL', 'Прибыль/убыток'],
  openFee: ['Opening Fee', 'Open Fee', 'Opening Fees', 'Комиссия за открытие'],
  closeFee: ['Closing Fee', 'Close Fee', 'Closing Fees', 'Комиссия за закрытие'],
  fee: ['Trading Fee', 'Trading Fees', 'Fee', 'Fees', 'Total Fee', 'Commission', 'Комиссия', 'Комиссии', 'Торговая комиссия'],
  funding: ['Funding Fee', 'Funding', 'Funding Fees', 'Фандинг', 'Комиссия за финансирование', 'Ставка финансирования'],
  leverage: ['Leverage', 'Плечо', 'Кредитное плечо'],
  openTime: ['Open Time', 'Opening Time', 'Opened Time', 'Entry Time', 'Время открытия', 'Время входа'],
  closeTime: ['Trade Time', 'Close Time', 'Closing Time', 'Closed Time', 'Exit Time', 'Time', 'Updated Time', 'Created Time', 'Transaction Time', 'Date', 'Время сделки', 'Время закрытия', 'Время', 'Дата'],
} as const

export type BybitField = keyof typeof FIELDS

/** BTCUSD, ETHUSD, BTCUSDZ26 (квартальные coin-M) — инверсные; остальное — USDT/USDC (linear). */
export function marketOf(symbol: string): MarketType {
  return /USD$/.test(symbol) || /USD[FGHJKMNQUVXZ]\d{2}$/.test(symbol) ? 'inverse' : 'linear'
}

/** «BTCUSDT Perpetual», «btc-usdt» → BTCUSDT / BTC-USDT; null — если не похоже на пару. */
export function normalizeSymbol(raw: string | undefined): string | null {
  const s = (raw ?? '').trim().split(/\s+/)[0]?.toUpperCase() ?? ''
  return /^[A-Z0-9._/-]{2,30}$/.test(s) ? s : null
}

/**
 * Направление ПОЗИЦИИ. В Closed P&L Bybit указывает сторону закрывающего ордера:
 * Sell закрывает лонг, Buy закрывает шорт. «Close Long» / «Long» / «Лонг» — понятно и так.
 */
export function positionSide(raw: string | undefined): Side | null {
  const s = (raw ?? '').trim().toLowerCase()
  if (/long|лонг/.test(s)) return 'long'
  if (/short|шорт/.test(s)) return 'short'
  if (/sell|продаж|продать/.test(s)) return 'long'
  if (/buy|покупк|купить/.test(s)) return 'short'
  return null
}

export const bybitParser: ImportParser<BybitField> = {
  exchange: 'bybit',
  fields: FIELDS,
  required: ['symbol', 'side', ['qty', 'entryValue'], 'entryPrice', 'exitPrice', 'closeTime'],
  timeField: 'closeTime',

  parse(table, mapping, { utcOffsetMinutes }) {
    const seen = new Map<string, number>()
    return table.rows.map((row, i): ParsedRow => {
      const line = i + 2
      const cell = (f: BybitField) => (mapping[f] >= 0 ? row[mapping[f]] : undefined)
      const n = (f: BybitField) => parseNumberCell(cell(f))
      const fail = (error: RowError): ParsedRow => ({ line, trade: null, error, warnings: [] })
      const warnings: RowWarning[] = []

      const symbol = normalizeSymbol(cell('symbol'))
      if (!symbol) return fail('symbol')
      const side = positionSide(cell('side'))
      if (!side) return fail('side')
      const entryPrice = n('entryPrice')
      if (entryPrice === null || entryPrice <= 0) return fail('entryPrice')
      const exitPrice = n('exitPrice')
      if (exitPrice === null || exitPrice <= 0) return fail('exitPrice')

      const market = marketOf(symbol)
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
      if (mapping.openTime >= 0) {
        const parsed = parseDateCell(cell('openTime'), utcOffsetMinutes)
        if (!parsed) return fail('time')
        entryAt = parsed
      } else warnings.push('noEntryTime')
      if (entryAt > exitAt) return fail('time')

      const funding = (n('funding') ?? 0) * coinToUsd
      const pnlFile = n('pnl')
      const gross = grossPnl({ marketType: market, side, entryPrice, exitPrice, sizeUsd })!

      // Комиссии — расход, всегда храним положительным числом
      const hasFeeCols = mapping.openFee >= 0 || mapping.closeFee >= 0 || mapping.fee >= 0
      let fee = hasFeeCols
        ? Math.abs(mapping.openFee >= 0 || mapping.closeFee >= 0 ? (n('openFee') ?? 0) + (n('closeFee') ?? 0) : (n('fee') ?? 0)) * coinToUsd
        : 0
      if (!hasFeeCols && pnlFile !== null) {
        const derived = gross + funding - pnlFile * coinToUsd
        if (derived > 0) {
          fee = derived
          warnings.push('feeDerived')
        }
      }

      const computed = gross - fee + funding
      const pnl = pnlFile !== null ? pnlFile * coinToUsd : computed
      // расхождение больше цента и 0,05% от размера — оставляем биржевой PnL и помечаем
      const pnlManual = pnlFile !== null && Math.abs(pnl - computed) > Math.max(0.01, sizeUsd * 0.0005)
      if (pnlManual) warnings.push('pnlFromFile')

      const leverageRaw = n('leverage')
      const leverage = leverageRaw !== null && leverageRaw >= 1 ? Math.min(leverageRaw, 1000) : 1

      // id: Order ID с биржи, иначе отпечаток строки. Одинаковые строки внутри файла различаем суффиксом.
      const orderId = (cell('orderId') ?? '').trim()
      const baseId = orderId ? `o:${orderId}` : `h:${stableHash([symbol, side, exitAt, entryAt, entryPrice, exitPrice, sizeUsd, pnl].join('|'))}`
      const dup = (seen.get(baseId) ?? 0) + 1
      seen.set(baseId, dup)
      const externalId = (dup > 1 ? `${baseId}#${dup}` : baseId).slice(0, 200)

      const trade: ImportedTrade = {
        exchange: 'bybit',
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
        external_id: externalId,
      }
      return { line, trade, error: null, warnings }
    })
  },
}
