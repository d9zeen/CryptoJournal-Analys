import { describe, expect, it } from 'vitest'
import { compactPnl, profitCalendar } from './calendar'

describe('profitCalendar', () => {
  // сентябрь 2026: 1-е — вторник, сетка с понедельника 31 августа
  const trades = [
    { exit_at: '2026-09-01T10:00:00Z', pnl: -226.36 },
    { exit_at: '2026-09-02T10:00:00Z', pnl: 200 },
    { exit_at: '2026-09-02T12:00:00Z', pnl: -62.8 },
    { exit_at: '2026-10-01T10:00:00Z', pnl: 1142.37 }, // соседний месяц, та же неделя, что 28–30 сентября
    { exit_at: '2026-09-30T22:30:00Z', pnl: 50 }, // в Москве это уже 1 октября
  ]
  const cal = profitCalendar(trades, 2026, 8, 'Europe/Moscow')

  it('сетка 6 × 7 с понедельника, дни соседних месяцев помечены', () => {
    expect(cal.weeks).toHaveLength(6)
    expect(cal.weeks[0].days[0]).toMatchObject({ date: '2026-08-31', day: 31, inMonth: false })
    expect(cal.weeks[0].days[1]).toMatchObject({ date: '2026-09-01', inMonth: true, pnl: -226.36, count: 1, wins: 0 })
  })

  it('день: PnL, сделки, выигрышные', () => {
    expect(cal.weeks[0].days[2]).toMatchObject({ date: '2026-09-02', count: 2, wins: 1 })
    expect(cal.weeks[0].days[2].pnl).toBeCloseTo(137.2)
  })

  it('день — по дате закрытия в поясе пользователя', () => {
    const oct1 = cal.weeks[4].days.find((d) => d.date === '2026-10-01')!
    expect(oct1).toMatchObject({ inMonth: false, count: 2 })
  })

  it('итог недели включает соседний месяц, итог месяца — только свои дни', () => {
    expect(cal.weeks[4].total.count).toBe(2)
    expect(cal.month.count).toBe(3)
    expect(cal.month.pnl).toBeCloseTo(-226.36 + 137.2)
    expect(cal.month.wins).toBe(1)
  })
})

describe('compactPnl', () => {
  it('коротко для узких клеток', () => {
    expect(compactPnl(1652.68)).toBe('+1.7k')
    expect(compactPnl(-2236.3)).toBe('−2.2k')
    expect(compactPnl(137.2)).toBe('+137')
    expect(compactPnl(-22.13)).toBe('−22.1')
    expect(compactPnl(2_000_000)).toBe('+2M')
    expect(compactPnl(0)).toBe('0')
  })
})
