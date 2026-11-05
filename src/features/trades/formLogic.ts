import type { MarketType, Side } from '@/lib/calc/trade'
import { netPnl, rMultiple, riskUsd, round } from '@/lib/calc/trade'
import { parseDecimal, toInput } from '@/lib/parse'
import { isoToLocalInput, localInputToIso } from '@/lib/format'
import type { TradeInput, TradeWithTags } from '@/types/db'

/** Состояние формы: всё строками, как в полях ввода */
export type FormState = {
  exchange: string
  marketType: MarketType
  symbol: string
  side: Side
  isClosed: boolean
  entryAt: string
  exitAt: string
  entryPrice: string
  exitPrice: string
  sizeUsd: string
  leverage: string
  stopLoss: string
  takeProfit: string
  fee: string
  funding: string
  pnlManual: boolean
  pnl: string
  setupId: string
  emotionId: string
  tagIds: string[]
  note: string
}

export type FieldError =
  | 'symbol' | 'entryAt' | 'entryPrice' | 'exitAt' | 'exitBeforeEntry' | 'exitPrice'
  | 'sizeUsd' | 'leverage' | 'positive' | 'fee' | 'number' | 'pnl'

export type FormErrors = Partial<Record<keyof FormState, FieldError>>

export function emptyForm(defaults?: Partial<FormState>, now = new Date()): FormState {
  const nowLocal = isoToLocalInput(now.toISOString())
  return {
    exchange: 'bybit',
    marketType: 'linear',
    symbol: '',
    side: 'long',
    isClosed: true,
    entryAt: nowLocal,
    exitAt: nowLocal,
    entryPrice: '',
    exitPrice: '',
    sizeUsd: '',
    leverage: '1',
    stopLoss: '',
    takeProfit: '',
    fee: '',
    funding: '',
    pnlManual: false,
    pnl: '',
    setupId: '',
    emotionId: '',
    tagIds: [],
    note: '',
    ...defaults,
  }
}

export function formFromTrade(tr: TradeWithTags): FormState {
  return {
    exchange: tr.exchange,
    marketType: tr.market_type,
    symbol: tr.symbol,
    side: tr.side,
    isClosed: tr.exit_at !== null,
    entryAt: isoToLocalInput(tr.entry_at),
    exitAt: tr.exit_at ? isoToLocalInput(tr.exit_at) : isoToLocalInput(new Date().toISOString()),
    entryPrice: toInput(tr.entry_price),
    exitPrice: toInput(tr.exit_price),
    sizeUsd: toInput(tr.size_usd),
    leverage: toInput(tr.leverage),
    stopLoss: toInput(tr.stop_loss),
    takeProfit: toInput(tr.take_profit),
    fee: tr.fee ? toInput(tr.fee) : '',
    funding: tr.funding ? toInput(tr.funding) : '',
    pnlManual: tr.pnl_manual,
    pnl: tr.pnl_manual ? toInput(tr.pnl) : '',
    setupId: tr.setup_id ?? '',
    emotionId: tr.emotion_id ?? '',
    tagIds: tr.trade_mistakes.map((m) => m.tag_id),
    note: tr.note ?? '',
  }
}

/** Нормализация тикера: «btc usdt» → «BTCUSDT» */
export function normalizeSymbol(s: string): string {
  return s.toUpperCase().replace(/\s+/g, '')
}

/** Живой расчёт для подсказок в форме */
export function computeDerived(f: FormState) {
  const entryPrice = parseDecimal(f.entryPrice)
  const exitPrice = f.isClosed ? parseDecimal(f.exitPrice) : null
  const sizeUsd = parseDecimal(f.sizeUsd)
  const stopLoss = parseDecimal(f.stopLoss)
  const calc = {
    marketType: f.marketType,
    side: f.side,
    entryPrice: entryPrice ?? NaN,
    exitPrice,
    sizeUsd: sizeUsd ?? NaN,
    fee: parseDecimal(f.fee) ?? 0,
    funding: parseDecimal(f.funding) ?? 0,
    stopLoss,
  }
  const pnlAuto = f.isClosed ? netPnl(calc) : null
  const pnl = !f.isClosed ? null : f.pnlManual ? parseDecimal(f.pnl) : pnlAuto
  const risk = riskUsd(calc)
  return { pnlAuto, pnl, risk, r: rMultiple(pnl, risk), entryPrice, sizeUsd, stopLoss }
}

/** Проверка формы и сборка строки для базы */
export function buildTrade(
  f: FormState,
  base: { id: string; screenshot_path: string | null },
): { trade: TradeInput | null; errors: FormErrors } {
  const errors: FormErrors = {}
  const num = (key: keyof FormState, opts: { required?: boolean; positive?: boolean; min0?: boolean; err?: FieldError } = {}) => {
    const raw = f[key] as string
    if (raw.trim() === '') {
      if (opts.required) errors[key] = opts.err ?? 'number'
      return null
    }
    const n = parseDecimal(raw)
    if (n === null) errors[key] = 'number'
    else if (opts.positive && n <= 0) errors[key] = opts.err ?? 'positive'
    else if (opts.min0 && n < 0) errors[key] = opts.err ?? 'fee'
    return n
  }

  const symbol = normalizeSymbol(f.symbol)
  if (!/^[A-Z0-9._/-]{2,30}$/.test(symbol)) errors.symbol = 'symbol'

  const entryAt = localInputToIso(f.entryAt)
  if (!entryAt) errors.entryAt = 'entryAt'
  const entryPrice = num('entryPrice', { required: true, positive: true, err: 'entryPrice' })
  const sizeUsd = num('sizeUsd', { required: true, positive: true, err: 'sizeUsd' })
  const isSpot = f.marketType === 'spot' || f.marketType === 'prediction' // без плеча и шорта
  const leverage = isSpot ? 1 : num('leverage', { required: true, positive: true, err: 'leverage' })
  if (leverage !== null && (leverage < 1 || leverage > 1000)) errors.leverage = 'leverage'
  const stopLoss = num('stopLoss', { positive: true })
  const takeProfit = num('takeProfit', { positive: true })
  const fee = num('fee', { min0: true }) ?? 0
  const funding = num('funding') ?? 0

  let exitAt: string | null = null
  let exitPrice: number | null = null
  if (f.isClosed) {
    exitAt = localInputToIso(f.exitAt)
    if (!exitAt) errors.exitAt = 'exitAt'
    else if (entryAt && exitAt < entryAt) errors.exitAt = 'exitBeforeEntry'
    // предсказание: проигравший исход — цена выхода 0
    exitPrice = num('exitPrice', { required: true, positive: f.marketType !== 'prediction', min0: true, err: 'exitPrice' })
  }

  const { pnl, r } = computeDerived(f)
  if (f.isClosed && f.pnlManual && pnl === null) errors.pnl = 'pnl'

  if (Object.keys(errors).length) return { trade: null, errors }

  return {
    errors,
    trade: {
      id: base.id,
      exchange: f.exchange,
      market_type: f.marketType,
      symbol,
      side: isSpot ? 'long' : f.side,
      entry_at: entryAt!,
      exit_at: exitAt,
      entry_price: entryPrice!,
      exit_price: exitPrice,
      size_usd: sizeUsd!,
      leverage: leverage!,
      fee,
      funding,
      stop_loss: stopLoss,
      take_profit: takeProfit,
      pnl: pnl === null ? null : round(pnl, 8),
      pnl_manual: f.isClosed && f.pnlManual,
      r_multiple: r === null ? null : round(r, 4),
      setup_id: f.setupId || null,
      emotion_id: f.emotionId || null,
      note: f.note.trim() || null,
      screenshot_path: base.screenshot_path,
    },
  }
}
