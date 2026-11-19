/**
 * Демо-счёт гостя (0024, «Открыть демо» без регистрации): те же 60 выдуманных сделок, что в превью на главной (landing/demo.ts),
 * превращаются в настоящие строки таблицы trades. Цены — с настоящих часовых свечей (если биржа ответила):
 * тогда на «Графике сделки» точки входа и выхода лежат на линии цены. Свечей нет — правдоподобные цены без привязки к рынку.
 * PnL сделки — ровно как в превью (pnl_manual), размер позиции подбирается под движение цены.
 */
import type { Candle } from '@/lib/candles'
import type { ClosedTrade } from '@/lib/calc/stats'
import type { DemoMistake } from '@/features/landing/demo'

/** Примерные цены, если свечей нет (порядок величины — чтобы карточки сделок выглядели правдоподобно) */
export const FALLBACK_PRICE: Record<string, number> = {
  BTCUSDT: 92000, ETHUSDT: 3100, SOLUSDT: 140, TONUSDT: 2.1, XRPUSDT: 2.2, DOGEUSDT: 0.16, BNBUSDT: 900, SUIUSDT: 1.6, LINKUSDT: 13, AVAXUSDT: 14,
}

/** Ошибки демо → стартовые теги ошибок нового пользователя (handle_new_user) */
export const MISTAKE_TAG: Record<DemoMistake, string> = { late: 'Поздний вход', nostop: 'Без стопа', hold: 'Двинул стоп' }
/** Сетапы и эмоции по кругу — из стартовых списков нового пользователя */
const SETUPS = ['Пробой уровня', 'Отбой от уровня', 'Ретест', 'По тренду']
const CALM = ['Спокоен', 'Уверен']
const NERVOUS = ['Страх', 'Жадность', 'Азарт', 'Тильт']

/** Риск на сделку в $ (как в превью: R = PnL / 90) */
const RISK_USD = 90
const MIN_SIZE = 500
const MAX_SIZE = 60000
const LEVERAGE = [5, 10, 10, 20, 3, 5]

/** Цена в момент t по часовым свечам: внутри свечи — между открытием и закрытием по доле прошедшего часа; null — свечи нет */
export function priceAt(candles: Candle[] | undefined, t: number, ivMs = 3_600_000): number | null {
  if (!candles?.length) return null
  let lo = 0
  let hi = candles.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (candles[mid].t <= t) lo = mid
    else hi = mid - 1
  }
  const c = candles[lo]
  if (t < c.t || t >= c.t + ivMs) return null
  const f = (t - c.t) / ivMs
  return c.o + (c.c - c.o) * f
}

/** Округление цены: значащих цифр хватает и для BTC, и для DOGE */
export function roundPrice(p: number): number {
  const digits = Math.max(2, 5 - Math.floor(Math.log10(Math.abs(p) || 1)))
  return Number(p.toFixed(Math.min(digits, 8)))
}

export type Lists = { setups: { id: string; name: string }[]; mistakes: { id: string; name: string }[]; emotions: { id: string; name: string }[] }

export type DemoRow = {
  id: string
  exchange: string
  market_type: 'linear'
  symbol: string
  side: 'long' | 'short'
  entry_at: string
  exit_at: string
  entry_price: number
  exit_price: number
  size_usd: number
  leverage: number
  fee: number
  funding: number
  stop_loss: number | null
  take_profit: number | null
  pnl: number
  pnl_manual: boolean
  r_multiple: number | null
  setup_id: string | null
  emotion_id: string | null
  note: string | null
  external_id: string
}

/**
 * Строки сделок и ошибок для вставки. candles — часовые свечи по символу (может не быть),
 * uuid — генератор id (в браузере crypto.randomUUID; в тестах — предсказуемый).
 */
export function buildDemoRows(
  trades: ClosedTrade[],
  lists: Lists,
  candles: Record<string, Candle[] | undefined>,
  uuid: () => string,
): { trades: DemoRow[]; mistakes: { trade_id: string; tag_id: string }[] } {
  const byName = (arr: { id: string; name: string }[], name: string) => arr.find((x) => x.name === name)?.id ?? null
  const rows: DemoRow[] = []
  const mistakes: { trade_id: string; tag_id: string }[] = []
  trades.forEach((tr, i) => {
    const entryMs = Date.parse(tr.entry_at)
    const exitMs = Date.parse(tr.exit_at)
    const realIn = priceAt(candles[tr.symbol], entryMs)
    const realOut = priceAt(candles[tr.symbol], exitMs)
    const real = realIn !== null && realOut !== null && realIn > 0
    let side = tr.side
    let entry: number
    let size: number
    if (real) {
      entry = realIn
      const move = (realOut - realIn) / realIn
      // знак PnL — как в превью; если рынок шёл против — значит, сделка была в другую сторону
      if (move !== 0) side = (move > 0) === tr.pnl > 0 ? 'long' : 'short'
      size = Math.abs(move) > 1e-6 ? Math.abs(tr.pnl / move) : MAX_SIZE
    } else {
      // без свечей: цена около примерной, лёгкий разброс по номеру сделки
      entry = (FALLBACK_PRICE[tr.symbol] ?? 100) * (1 + (((i * 37) % 21) - 10) / 400)
      size = 1500 + ((i * 53) % 9) * 400
    }
    size = Math.min(MAX_SIZE, Math.max(MIN_SIZE, size))
    const dir = side === 'long' ? 1 : -1
    // выход — такой, чтобы PnL позиции этого размера был ровно как в превью (у настоящих свечей — почти там же, где рынок)
    const exit = entry * (1 + (dir * tr.pnl) / size)
    const mistake = (tr.tagIds[0] ?? null) as DemoMistake | null
    const stop = mistake === 'nostop' ? null : roundPrice(entry * (1 - (dir * RISK_USD) / size))
    const id = uuid()
    rows.push({
      id,
      exchange: 'bybit',
      market_type: 'linear',
      symbol: tr.symbol,
      side,
      entry_at: tr.entry_at,
      exit_at: tr.exit_at,
      entry_price: roundPrice(entry),
      exit_price: roundPrice(exit),
      size_usd: Math.round(size * 100) / 100,
      leverage: LEVERAGE[i % LEVERAGE.length],
      fee: 0,
      funding: 0,
      stop_loss: stop,
      take_profit: null,
      pnl: tr.pnl,
      pnl_manual: true,
      r_multiple: stop === null ? null : Math.round((tr.pnl / RISK_USD) * 100) / 100,
      setup_id: byName(lists.setups, SETUPS[i % SETUPS.length]),
      emotion_id: byName(lists.emotions, mistake ? NERVOUS[i % NERVOUS.length] : CALM[i % CALM.length]),
      note: null,
      external_id: `demo:${i}`,
    })
    const tag = mistake ? byName(lists.mistakes, MISTAKE_TAG[mistake]) : null
    if (tag) mistakes.push({ trade_id: id, tag_id: tag })
  })
  return { trades: rows, mistakes }
}
