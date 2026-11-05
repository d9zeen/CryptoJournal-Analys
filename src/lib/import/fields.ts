/**
 * Поля импорта и синонимы названий колонок (английские и русские) у разных бирж.
 * Порядок полей важен: поле, объявленное раньше, первым забирает подходящую колонку.
 */
import type { MarketType, Side } from '@/lib/calc/trade'

export const FIELDS = {
  orderId: ['Order ID', 'Order No', 'Order Number', 'OrderId', 'Trade ID', 'Exec ID', 'Transaction ID', 'ID ордера', 'Номер ордера', 'ID'],
  symbol: ['Contracts', 'Contract', 'Symbol', 'Futures', 'Instrument', 'Market', 'Trading Pair', 'Pair', 'Контракты', 'Контракт', 'Символ', 'Торговая пара', 'Пара', 'Инструмент'],
  side: ['Closing Direction', 'Close Direction', 'Position Side', 'Position Direction', 'Pos. Side', 'Direction', 'Side', 'Order Direction', 'Trade Side', 'Action', 'Направление закрытия', 'Направление', 'Сторона'],
  qty: ['Closed Qty', 'Closed Size', 'Closed Amount', 'Closed Quantity', 'Close Amount', 'Filled Qty', 'Filled Quantity', 'Filled Size', 'Exec Qty', 'Exec Quantity', 'Executed Qty', 'Executed Quantity', 'Trade Qty', 'Trade Quantity', 'Deal Qty', 'Qty', 'Quantity', 'Size', 'Position Size', 'Executed', 'Filled', 'Кол-во', 'Количество', 'Закрытое количество', 'Исполненное количество', 'Объем', 'Объём'],
  entryValue: ['Entry Value', 'Cum Entry Value', 'Position Value', 'Open Value', 'Стоимость входа', 'Стоимость позиции'],
  entryPrice: ['Entry Price', 'Avg Entry Price', 'Average Entry Price', 'Avg. Open Price', 'Avg Open Price', 'Average Open Price', 'Average Opening Price', 'Opening Price', 'Open Price', 'Цена входа', 'Средняя цена входа', 'Цена открытия'],
  exitPrice: ['Exit Price', 'Avg Exit Price', 'Average Exit Price', 'Avg. Close Price', 'Avg Close Price', 'Average Close Price', 'Average Closing Price', 'Closing Price', 'Close Price', 'Цена выхода', 'Средняя цена выхода', 'Цена закрытия'],
  // цена одного исполнения — для истории сделок (fills)
  price: ['Price', 'Filled Price', 'Fill Price', 'Exec Price', 'Trade Price', 'Avg. Price', 'Avg Price', 'Average Price', 'Deal Price', 'Цена', 'Цена исполнения'],
  // сумма исполнения в валюте котировки — если нет количества монет
  value: ['Exec Value', 'Filled Value', 'Executed Value', 'Trade Value', 'Deal Value', 'Amount', 'Value', 'Total', 'Turnover', 'Сумма', 'Сумма исполнения'],
  pnl: ['Closed P&L', 'Closed PnL', 'Realized Profit', 'Realized P&L', 'Realized PnL', 'Realised P&L', 'Realised PnL', 'Net PnL', 'P&L', 'PnL', 'Profit', 'Закрытый P&L', 'Закрытые P&L', 'Закрытый PnL', 'Реализованный P&L', 'Реализованный PnL', 'Прибыль/убыток'],
  openFee: ['Opening Fee', 'Open Fee', 'Opening Fees', 'Комиссия за открытие'],
  closeFee: ['Closing Fee', 'Close Fee', 'Closing Fees', 'Комиссия за закрытие'],
  fee: ['Trading Fee', 'Trading Fees', 'Exec Fee', 'Fee', 'Fees', 'Total Fee', 'Commission', 'Комиссия', 'Комиссии', 'Торговая комиссия'],
  feeCoin: ['Fee Coin', 'Fee Currency', 'Fee Asset', 'Fee Unit', 'Commission Asset', 'Валюта комиссии'],
  funding: ['Funding Fee', 'Funding', 'Funding Fees', 'Фандинг', 'Комиссия за финансирование', 'Ставка финансирования'],
  // вид строки истории исполнений: сделка или фандинг (Bybit UTA: Filled Type = Trade / Funding)
  rowType: ['Filled Type', 'Fill Type', 'Exec Type', 'Execution Type', 'Transaction Type', 'Тип исполнения'],
  // цена ордера: у покупки она не ниже цены исполнения, у продажи — не выше (так видно направление)
  orderPrice: ['Order Price', 'Цена ордера'],
  // открытие / закрытие — если направление разнесено на две колонки («Long» + «Open»)
  sideHint: ['Open/Close', 'Open Close', 'Trade Type', 'Position Effect', 'Effect', 'Action Type', 'Type', 'Тип сделки', 'Открытие/Закрытие'],
  leverage: ['Leverage', 'Плечо', 'Кредитное плечо'],
  openTime: ['Open Time', 'Opening Time', 'Opened Time', 'Time Opened', 'Opened', 'Entry Time', 'Время открытия', 'Время входа'],
  closeTime: ['Trade Time', 'Close Time', 'Closing Time', 'Closed Time', 'Time Closed', 'Closed', 'Exit Time', 'Exec Time', 'Date(UTC)', 'Time', 'Updated Time', 'Created Time', 'Transaction Time', 'Date', 'Время сделки', 'Время закрытия', 'Время исполнения', 'Время', 'Дата'],
} as const

export type ImportField = keyof typeof FIELDS

/**
 * Запасной поиск, если точного названия нет: колонка, в названии которой есть такое слово
 * (биржи часто меняют заголовки: «Filled Quantity», «Qty(BTC)», «Exec. Qty / Contracts»).
 * prefer — слова, которые делают колонку предпочтительнее (исполненный объём, а не объём ордера), avoid — наоборот.
 */
export const FUZZY: Partial<Record<ImportField, { words: string[]; prefer: string[]; avoid: string[] }>> = {
  qty: { words: ['qty', 'quantity', 'size', 'volume', 'количество', 'колво', 'объем'], prefer: ['fill', 'exec', 'trade', 'deal', 'closed', 'исполн'], avoid: ['order', 'leaves', 'remain', 'cancel', 'ордер'] },
  value: { words: ['value', 'turnover', 'notional', 'стоимость', 'сумма'], prefer: ['fill', 'exec', 'trade', 'deal', 'исполн'], avoid: ['order', 'entry', 'position', 'ордер'] },
}

/** Валюты, комиссия в которых уже в долларах */
export const USD_COINS = new Set(['USDT', 'USDC', 'USD', 'BUSD', 'FDUSD', 'TUSD', 'USDE', 'DAI'])

/** Убираем хвосты бессрочных контрактов: BTC-USDT-SWAP → BTC-USDT, BTCPERP → BTC */
function core(symbol: string): string {
  return symbol.replace(/[-_]?(SWAP|PERPETUAL|PERP)$/, '')
}

/** BTCUSD, BTC-USD-SWAP, BTCUSDZ26 — инверсные (coin-M); остальное — USDT/USDC (linear). */
export function marketOf(symbol: string): MarketType {
  const s = core(symbol)
  return /USD$/.test(s) || /USD[FGHJKMNQUVXZ]\d{2}$/.test(s) || /-USD-\d{6}$/.test(s) ? 'inverse' : 'linear'
}

/** «BTCUSDT Perpetual», «btc-usdt» → BTCUSDT / BTC-USDT; null — если не похоже на пару. */
export function normalizeSymbol(raw: string | undefined): string | null {
  const s = (raw ?? '').trim().split(/\s+/)[0]?.toUpperCase() ?? ''
  return /^[A-Z0-9._/-]{2,30}$/.test(s) ? s : null
}

/** Как понимать Buy/Sell в колонке направления закрытой позиции */
export type SideMeaning = 'closing' | 'opening'

/**
 * Направление ПОЗИЦИИ из колонки направления.
 * «Long/Short/Лонг/Шорт» — понятно и так. Buy/Sell: при meaning='closing' это закрывающий ордер
 * (Sell закрывает лонг — Bybit Closed P&L), при 'opening' — открывающий (Buy = long).
 */
export function positionSide(raw: string | undefined, meaning: SideMeaning = 'closing'): Side | null {
  const s = (raw ?? '').trim().toLowerCase()
  if (/long|лонг/.test(s)) return 'long'
  if (/short|шорт/.test(s)) return 'short'
  const buy = /buy|покупк|купить|^b$/.test(s)
  const sell = /sell|продаж|продать|^s$/.test(s)
  if (!buy && !sell) return null
  if (meaning === 'closing') return sell ? 'long' : 'short'
  return buy ? 'long' : 'short'
}

/** Если заголовок колонки говорит сам за себя — он важнее настройки биржи */
export function sideMeaningFromHeader(header: string | undefined, fallback: SideMeaning): SideMeaning {
  const h = (header ?? '').toLowerCase()
  if (/clos|закр/.test(h)) return 'closing'
  if (/position|позиц|open|откр/.test(h)) return 'opening'
  return fallback
}

/** Просто «Long» / «Short» (без открытия / закрытия) → +1 / −1, иначе null */
export function bareSide(raw: string | undefined): 1 | -1 | null {
  const s = (raw ?? '').trim().toLowerCase()
  if (/^(long|лонг|多)$/.test(s)) return 1
  if (/^(short|шорт|空)$/.test(s)) return -1
  return null
}

/** Знак исполнения в истории сделок: +1 — покупка (растит лонг / закрывает шорт), −1 — продажа. */
export function fillSign(raw: string | undefined): 1 | -1 | null {
  const s = (raw ?? '').trim().toLowerCase().replace(/[_\-/\s]+/g, ' ')
  if (!s) return null
  // китайский интерфейс: 开多 / 平空 — покупка, 开空 / 平多 — продажа, 买 / 卖
  if (/开多|平空/.test(s)) return 1
  if (/开空|平多/.test(s)) return -1
  const long = /long|лонг|^l$/.test(s)
  const short = /short|шорт/.test(s)
  const open = /open|откр|^o\b|\bo$/.test(s)
  const close = /clos|закр|^c\b|\bc$/.test(s)
  if (long && open) return 1
  if (long && close) return -1
  if (short && open) return -1
  if (short && close) return 1
  if (/buy|bid|покупк|купить|куплено|^b$|^bo$|^bc$|买/.test(s)) return 1
  if (/sell|ask|продаж|продать|продано|^s$|^so$|^sc$|卖/.test(s)) return -1
  return null
}

/** Валюта комиссии: из отдельной колонки или из хвоста значения («0.0001BNB») */
export function feeCoinOf(feeCell: string | undefined, coinCell: string | undefined): string | null {
  const c = (coinCell ?? '').trim().toUpperCase()
  if (c) return c
  const m = /([A-Za-z]{2,10})\s*$/.exec(feeCell ?? '')
  return m ? m[1].toUpperCase() : null
}

/**
 * Комиссия → USD. Валюта-доллар — как есть; базовая монета пары (BTC у BTCUSDT, BTC у BTCUSD) — × цену;
 * посторонняя монета (BNB и т.п.) — перевести нельзя: null.
 */
export function feeToUsd(amount: number, coin: string | null, symbol: string, price: number, market: MarketType): number | null {
  const a = Math.abs(amount)
  if (!coin) return market === 'inverse' ? a * price : a
  if (USD_COINS.has(coin)) return a
  if (symbol.startsWith(coin)) return a * price
  return null
}
