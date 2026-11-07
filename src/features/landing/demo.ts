/**
 * Демо-счёт для главной страницы: 60 выдуманных сделок за два месяца (детерминированно — одинаково при каждом открытии).
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

/** seed — другое зерно = другие сделки (стартовый экран берёт новое на каждый круг примера) */
export function demoAccount(now = Date.now(), seed = 20261106) {
  const start = now - 61 * DAY
  const rnd = seeded(seed)
  // пара и направление — отдельным генератором, чтобы суммы сделок от них не зависели
  const pick = seeded(seed ^ 0x5bd1e995)
  const used = new Set<number>()
  const trades: StatTrade[] = Array.from({ length: DEMO_TRADES }, (_, i) => {
    // как у живого трейдера: ~58 % сделок в плюс, прибыль крупнее убытка, в середине — серия неудач (просадка)
    const slump = i >= 24 && i <= 33
    const win = rnd() < (slump ? 0.25 : 0.62)
    const size = win ? 40 + rnd() * 230 : 30 + rnd() * (slump ? 190 : 120)
    let pnl = Math.round((win ? size : -size) * 100) / 100
    // одинаковых сумм не бывает: совпала — сдвигаем на несколько центов
    while (used.has(pnl)) pnl = Math.round((pnl + (win ? 0.07 : -0.07)) * 100) / 100
    used.add(pnl)
    const exit = new Date(start + i * DAY + 14 * 3_600_000).toISOString()
    return {
      id: `demo-${i}`,
      side: pick() < 0.55 ? 'long' : 'short',
      symbol: SYMBOLS[Math.floor(pick() * SYMBOLS.length)],
      entry_at: new Date(start + i * DAY + 10 * 3_600_000).toISOString(),
      exit_at: exit,
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
  }
}
