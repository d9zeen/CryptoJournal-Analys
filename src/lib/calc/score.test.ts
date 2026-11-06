import { describe, expect, it } from 'vitest'
import { traderScore } from './score'
import type { DayPnl, Summary } from './stats'

const base: Summary = {
  closed: 20,
  wins: 12,
  losses: 8,
  breakeven: 0,
  winrate: 0.6,
  totalPnl: 1000,
  avgWin: 150,
  avgLoss: -100,
  profitFactor: 2.25,
  expectancy: 50,
  avgR: null,
  rCount: 0,
  best: 300,
  worst: -200,
  maxDrawdown: 400,
  maxDrawdownPct: null,
}
const day = (date: string, pnl: number): DayPnl => ({ date, pnl, count: 1 })
const days = [day('2026-11-01', 400), day('2026-11-02', 300), day('2026-11-03', -100), day('2026-11-04', 500), day('2026-11-05', -100)]

describe('traderScore', () => {
  it('считает каждый показатель по своей шкале и взвешенный итог', () => {
    const s = traderScore(base, days)
    const by = Object.fromEntries(s.parts.map((p) => [p.key, p.score]))
    expect(by.profitFactor).toBe(85) // (2,25 − 0,8) / 1,7
    expect(by.winLoss).toBe(50) // 1,5: (1,5 − 0,5) / 2
    expect(by.recovery).toBe(83) // 2,5 / 3
    expect(by.winrate).toBe(86) // (0,6 − 0,3) / 0,35
    expect(by.dayWinrate).toBe(75) // 3 из 5 дней = 0,6
    expect(by.consistency).toBe(41) // лучший день 500 из 1200 = 0,42: (0,42 − 0,6) / (0,15 − 0,6)
    expect(s.dayWins).toBe(3)
    expect(s.dayLosses).toBe(2)
    // 85·0,25 + 50·0,2 + 83·0,2 + 86·0,15 + 75·0,1 + 41·0,1 = 72,35
    expect(s.total).toBe(72)
  })

  it('без убытков: profit factor и выигрыш/проигрыш — максимум', () => {
    const s = traderScore({ ...base, losses: 0, avgLoss: null, profitFactor: Infinity, maxDrawdown: 0 }, [day('2026-11-01', 100), day('2026-11-02', 100)])
    const by = Object.fromEntries(s.parts.map((p) => [p.key, p.score]))
    expect(by.profitFactor).toBe(100)
    expect(by.winLoss).toBe(100)
    expect(by.recovery).toBe(100)
  })

  it('в минусе: стабильность и восстановление — 0, итог низкий', () => {
    const s = traderScore({ ...base, totalPnl: -500, profitFactor: 0.5, winrate: 0.25, avgWin: 50, avgLoss: -150 }, [day('2026-11-01', -500)])
    const by = Object.fromEntries(s.parts.map((p) => [p.key, p.score]))
    expect(by.consistency).toBe(0)
    expect(by.recovery).toBe(0)
    expect(s.total).toBe(0)
  })

  it('пустой период — всё по нулям, без NaN', () => {
    const s = traderScore({ ...base, closed: 0, wins: 0, losses: 0, winrate: null, totalPnl: 0, avgWin: null, avgLoss: null, profitFactor: null, maxDrawdown: 0 }, [])
    expect(s.total).toBe(0)
    expect(s.dayWinrate).toBeNull()
    for (const p of s.parts) expect(Number.isNaN(p.score)).toBe(false)
  })
})
