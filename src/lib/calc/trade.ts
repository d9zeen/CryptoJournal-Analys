/**
 * Формулы по одной сделке. Все суммы — в USD.
 * Подробное описание — docs/PLAN.md, раздел «Формулы».
 */
/** prediction — рынок предсказаний (Polymarket): цена исхода 0…1, проигравший исход погашается по 0 */
export type MarketType = 'linear' | 'inverse' | 'spot' | 'prediction'
export type Side = 'long' | 'short'

export type TradeCalcInput = {
  marketType: MarketType
  side: Side
  entryPrice: number
  exitPrice?: number | null
  /** номинал позиции в USD (с учётом плеча) */
  sizeUsd: number
  /** все комиссии, USD (положительное число) */
  fee?: number
  /** фандинг, USD: + получил / − заплатил */
  funding?: number
  stopLoss?: number | null
}

const dir = (side: Side) => (side === 'long' ? 1 : -1)
const valid = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0

/** Количество монет (для linear и спота). */
export function qtyCoins(sizeUsd: number, entryPrice: number): number | null {
  return valid(sizeUsd) && valid(entryPrice) ? sizeUsd / entryPrice : null
}

/** Маржа = размер / плечо. */
export function marginUsd(sizeUsd: number, leverage: number): number | null {
  return valid(sizeUsd) && valid(leverage) ? sizeUsd / leverage : null
}

/** PnL инверсного контракта в монете (например, в BTC для BTCUSD). */
export function inversePnlCoin(t: TradeCalcInput): number | null {
  if (!valid(t.entryPrice) || !valid(t.exitPrice) || !valid(t.sizeUsd)) return null
  return dir(t.side) * t.sizeUsd * (1 / t.entryPrice - 1 / t.exitPrice)
}

/** Валовый PnL до комиссий и фандинга, USD. null — если сделка не закрыта или не хватает данных. */
export function grossPnl(t: TradeCalcInput): number | null {
  // у предсказаний проигравший исход погашается по 0
  const exit = t.exitPrice
  const exitOk = typeof exit === 'number' && Number.isFinite(exit) && (exit > 0 || (t.marketType === 'prediction' && exit === 0))
  if (!valid(t.entryPrice) || !exitOk || !valid(t.sizeUsd)) return null
  if (t.marketType === 'inverse') {
    // PnL в монете, переведённый в USD по цене выхода
    return inversePnlCoin(t)! * (exit as number)
  }
  const qty = t.sizeUsd / t.entryPrice
  return dir(t.side) * ((exit as number) - t.entryPrice) * qty
}

/** Итоговый (реализованный) PnL = валовый − комиссии + фандинг. */
export function netPnl(t: TradeCalcInput): number | null {
  const gross = grossPnl(t)
  if (gross === null) return null
  return gross - (t.fee ?? 0) + (t.funding ?? 0)
}

/** Риск в USD до стопа: размер × |стоп − вход| / вход. */
export function riskUsd(t: Pick<TradeCalcInput, 'entryPrice' | 'sizeUsd' | 'stopLoss'>): number | null {
  if (!valid(t.entryPrice) || !valid(t.sizeUsd) || !valid(t.stopLoss)) return null
  const risk = (t.sizeUsd * Math.abs(t.stopLoss - t.entryPrice)) / t.entryPrice
  return risk > 0 ? risk : null
}

/** R-multiple = PnL / риск. null, если нет стопа или PnL. */
export function rMultiple(pnl: number | null | undefined, risk: number | null | undefined): number | null {
  if (pnl === null || pnl === undefined || !Number.isFinite(pnl) || !valid(risk)) return null
  return pnl / risk
}

/** Стоп стоит не с той стороны (для лонга выше входа, для шорта ниже). */
export function isStopOnWrongSide(side: Side, entryPrice: number, stopLoss: number | null | undefined): boolean {
  if (!valid(entryPrice) || !valid(stopLoss)) return false
  return side === 'long' ? stopLoss >= entryPrice : stopLoss <= entryPrice
}

/** Округление для сохранения в базу. */
export function round(n: number, digits = 8): number {
  const f = 10 ** digits
  return Math.round(n * f) / f
}
