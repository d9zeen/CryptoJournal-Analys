/**
 * Демо-счёт для главной страницы: 60 выдуманных сделок за два месяца (детерминированно — одинаково при каждом открытии).
 * Считается теми же функциями, что и настоящий дашборд.
 */
import { closedTrades, downsampleEquity, equityCurve, pnlByDay, summarize, type StatTrade } from '@/lib/calc/stats'
import { traderScore } from '@/lib/calc/score'

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'TONUSDT']
const DAY = 86_400_000

export function demoAccount(now = Date.now()) {
  const start = now - 61 * DAY
  const trades: StatTrade[] = Array.from({ length: 60 }, (_, i) => {
    const w = Math.sin(i * 1.7) + 0.35
    const pnl = Math.round(w * 180 * 100) / 100
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
  return { summary, equity: downsampleEquity(curve), score: traderScore(summary, days), balance: 5000 }
}
