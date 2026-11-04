/** Законы статистики на случайных наборах сделок (детерминированный генератор). */
import { describe, expect, it } from 'vitest'
import { bySetup, byWeekday, closedTrades, equityCurve, pnlByDay, summarize, type StatTrade } from './stats'

function rng(seed: number) {
  let s = seed >>> 0
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32)
}

function gen(seed: number): StatTrade[] {
  const r = rng(seed)
  const n = Math.floor(r() * 60)
  return Array.from({ length: n }, (_, i) => {
    const entry = Date.UTC(2026, 0, 1) + Math.floor(r() * 300) * 86_400_000 + Math.floor(r() * 86_400_000)
    const open = r() < 0.1
    const pnl = Math.round((r() - 0.45) * 40000) / 100
    return {
      id: `t${i}`,
      side: r() < 0.5 ? 'long' : 'short',
      symbol: ['BTCUSDT', 'ETHUSDT'][i % 2],
      entry_at: new Date(entry).toISOString(),
      exit_at: open ? null : new Date(entry + Math.floor(r() * 86_400_000)).toISOString(),
      pnl: open ? null : r() < 0.05 ? 0 : pnl,
      r_multiple: r() < 0.5 ? null : Math.round((r() - 0.4) * 400) / 100,
      setup_id: r() < 0.3 ? null : `s${Math.floor(r() * 3)}`,
      emotion_id: null,
      tagIds: [],
    } as StatTrade
  })
}

describe('статистика: законы на 300 случайных наборах', () => {
  it('суммы, счётчики, просадка и группировки сходятся', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const closed = closedTrades(gen(seed))
      const s = summarize(closed, 10_000)
      const total = closed.reduce((a, t) => a + t.pnl, 0)
      const losses = closed.filter((t) => t.pnl < 0).reduce((a, t) => a - t.pnl, 0)

      expect(s.wins + s.losses + s.breakeven, `seed ${seed}`).toBe(s.closed)
      expect(s.totalPnl, `seed ${seed}`).toBeCloseTo(total, 6)
      expect(equityCurve(closed).at(-1)!.cum, `seed ${seed}`).toBeCloseTo(total, 6)
      expect(pnlByDay(closed, 'Europe/Moscow').reduce((a, d) => a + d.pnl, 0)).toBeCloseTo(total, 6)
      expect(bySetup(closed).reduce((a, g) => a + g.pnl, 0)).toBeCloseTo(total, 6)
      expect(byWeekday(closed, 'Asia/Tokyo').reduce((a, g) => a + g.count, 0)).toBe(s.closed)
      // просадка не больше суммы всех убытков и не отрицательна
      expect(s.maxDrawdown).toBeGreaterThanOrEqual(0)
      expect(s.maxDrawdown).toBeLessThanOrEqual(losses + 1e-9)
      if (s.winrate !== null) expect(s.winrate).toBeGreaterThanOrEqual(0)
      if (s.winrate !== null) expect(s.winrate).toBeLessThanOrEqual(1)
      if (s.maxDrawdownPct !== null) expect(s.maxDrawdownPct).toBeLessThanOrEqual(1)
    }
  })
})
