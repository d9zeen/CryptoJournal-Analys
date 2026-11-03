/**
 * Bybit — экспорт «Closed P&L» (деривативы): строка = закрытая позиция,
 * сторона в файле — закрывающий ордер (Sell закрыл лонг). Работает через общий движок.
 */
import { makeParser } from './universal'

export { marketOf, normalizeSymbol } from './fields'
export { positionSide } from './fields'

export const bybitParser = makeParser('bybit', 'closing')
