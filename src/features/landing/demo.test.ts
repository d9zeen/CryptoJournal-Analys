import { describe, expect, it } from 'vitest'
import { DEMO_TRADES, demoAccount } from './demo'

describe('demoAccount', () => {
  it('одно и то же зерно — одни и те же сделки (главная выглядит одинаково)', () => {
    expect(demoAccount(0).summary).toEqual(demoAccount(0).summary)
  })

  it('пары и направления вперемешку, суммы не повторяются', () => {
    for (const seed of [1, 2, 3, 20261106]) {
      const tr = demoAccount(0, seed).trades
      expect(tr).toHaveLength(DEMO_TRADES)
      // не «лонг, шорт, лонг, шорт»: хотя бы где-то две одинаковые стороны подряд
      expect(tr.some((x, i) => i > 0 && x.side === tr[i - 1].side)).toBe(true)
      expect(new Set(tr.map((x) => x.symbol)).size).toBeGreaterThan(4)
      expect(new Set(tr.map((x) => x.pnl)).size).toBe(tr.length)
    }
  })

  it('другое зерно — другие сделки', () => {
    const a = demoAccount(0, 1).trades.map((x) => x.pnl)
    const b = demoAccount(0, 2).trades.map((x) => x.pnl)
    expect(a).not.toEqual(b)
  })
})
