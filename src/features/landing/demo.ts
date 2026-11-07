/**
 * Демо-счёт для главной страницы: 60 выдуманных сделок за два месяца (детерминированно — одинаково при каждом открытии).
 * Считается теми же функциями, что и настоящий дашборд.
 */
import { closedTrades, downsampleEquity, drawdownPeriod, equityCurve, pnlBars, pnlByDay, rWinLoss, summarize, type StatTrade } from '@/lib/calc/stats'
import { traderScore } from '@/lib/calc/score'

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'TONUSDT']

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

export function demoAccount(now = Date.now()) {
  const start = now - 61 * DAY
  const rnd = seeded(20261106)
  const trades: StatTrade[] = Array.from({ length: 60 }, (_, i) => {
    // как у живого трейдера: ~58 % сделок в плюс, прибыль крупнее убытка, в середине — серия неудач (просадка)
    const slump = i >= 24 && i <= 33
    const win = rnd() < (slump ? 0.25 : 0.62)
    const size = win ? 40 + rnd() * 230 : 30 + rnd() * (slump ? 190 : 120)
    const pnl = Math.round((win ? size : -size) * 100) / 100
    const exit = new Date(start + i * DAY + 14 * 3_600_000).toISOString()
    return {
      id: `demo-${i}`,
      side: i % 2 ? 'short' : 'long',
      symbol: SYMBOLS[i % 4],
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
