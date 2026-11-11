/**
 * Демо-счёт для главной страницы: 60 выдуманных сделок примерно за два месяца, 0–4 в день (детерминированно — одинаково при каждом открытии).
 * Считается теми же функциями, что и настоящий дашборд.
 */
import { closedTrades, downsampleEquity, drawdownPeriod, equityCurve, pnlBars, pnlByDay, rWinLoss, summarize, type StatTrade } from '@/lib/calc/stats'
import { traderScore } from '@/lib/calc/score'

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'TONUSDT', 'XRPUSDT', 'DOGEUSDT', 'BNBUSDT', 'SUIUSDT', 'LINKUSDT', 'AVAXUSDT']
/** Сколько сделок в демо-счёте */
export const DEMO_TRADES = 60

/** Простой генератор случайных чисел с зерном (mulberry32): одни и те же «случайные» сделки при каждом открытии */
function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const DAY = 86_400_000

/** Сделка из «пути одной сделки» на главной: ETHUSDT Short −61,20 $ (в середине просадки) */
export const DEMO_FEATURED = { index: 27, symbol: 'ETHUSDT', side: 'short' as const, pnl: -61.2 }

/** Сколько сделок в день: 0…4, чаще 0–1 (в среднем ≈ 1 в день — 60 сделок примерно за два месяца) */
function dayCount(r: number): number {
  return r < 0.4 ? 0 : r < 0.68 ? 1 : r < 0.86 ? 2 : r < 0.95 ? 3 : 4
}

/** seed — другое зерно = другие сделки (стартовый экран берёт новое на каждый круг примера) */
export function demoAccount(now = Date.now(), seed = 20261106) {
  const rnd = seeded(seed)
  // пара и направление — отдельным генератором, чтобы суммы сделок от них не зависели
  const pick = seeded(seed ^ 0x5bd1e995)
  // дни и часы — третьим генератором: 0–4 сделки в день, выходные тоже, бывают пустые дни
  const cal = seeded(seed ^ 0x27d4eb2f)
  const perDay: number[] = []
  for (let n = 0; n < DEMO_TRADES; ) {
    const c = Math.min(dayCount(cal()), DEMO_TRADES - n)
    perDay.push(c)
    n += c
  }
  // последний день со сделками — вчера (по UTC)
  const start = (Math.floor(now / DAY) - perDay.length) * DAY
  const times: number[] = []
  perDay.forEach((c, d) => {
    const hours = Array.from({ length: c }, () => 8 + cal() * 14).sort((a, b) => a - b)
    for (const h of hours) times.push(start + d * DAY + Math.round(h * 60) * 60_000)
  })
  const used = new Set<number>([DEMO_FEATURED.pnl])
  const trades: StatTrade[] = Array.from({ length: DEMO_TRADES }, (_, i) => {
    // как у живого трейдера: ~58 % сделок в плюс, прибыль крупнее убытка, в середине — серия неудач (просадка)
    const slump = i >= 24 && i <= 33
    const win = rnd() < (slump ? 0.25 : 0.62)
    const size = win ? 40 + rnd() * 230 : 30 + rnd() * (slump ? 190 : 120)
    let pnl = Math.round((win ? size : -size) * 100) / 100
    // одинаковых сумм не бывает: совпала — сдвигаем на несколько центов
    while (used.has(pnl)) pnl = Math.round((pnl + (win ? 0.07 : -0.07)) * 100) / 100
    used.add(pnl)
    let side: 'long' | 'short' = pick() < 0.55 ? 'long' : 'short'
    let symbol = SYMBOLS[Math.floor(pick() * SYMBOLS.length)]
    if (i === DEMO_FEATURED.index) ({ symbol, side, pnl } = DEMO_FEATURED)
    const exit = times[i]
    const hold = (20 + Math.floor(rnd() * 220)) * 60_000 // держал от 20 минут до 4 часов
    return {
      id: `demo-${i}`,
      side,
      symbol,
      entry_at: new Date(exit - hold).toISOString(),
      exit_at: new Date(exit).toISOString(),
      pnl,
      r_multiple: Math.round((pnl / 90) * 100) / 100,
      setup_id: null,
      emotion_id: null,
      tagIds: [],
    }
  })
  const closed = closedTrades(trades)
  const curve = equityCurve(closed)
  const summary = summarize(closed, 5000)
  const days = pnlByDay(closed, 'UTC')
  return {
    summary,
    curve,
    equity: downsampleEquity(curve),
    score: traderScore(summary, days),
    balance: 5000,
    period: drawdownPeriod(curve),
    rwl: rWinLoss(closed),
    bars: pnlBars(days),
    trades: closed,
    days,
  }
}
