import { describe, expect, it } from 'vitest'
import {
  byHour,
  bySetup,
  bySide,
  byWeekday,
  closedTrades,
  drawdown,
  equityCurve,
  pnlByDay,
  summarize,
  topMistakes,
  type StatTrade,
} from './stats'
import { zonedParts } from '@/lib/tz'

let seq = 0
function tr(p: Partial<StatTrade> & { pnl: StatTrade['pnl'] }): StatTrade {
  seq++
  return {
    id: `t${seq}`,
    side: 'long',
    symbol: 'BTCUSDT',
    entry_at: `2026-11-0${(seq % 9) + 1}T10:00:00Z`,
    exit_at: `2026-11-0${(seq % 9) + 1}T12:00:00Z`,
    r_multiple: null,
    setup_id: null,
    emotion_id: null,
    tagIds: [],
    ...p,
  }
}

describe('closedTrades', () => {
  it('отбрасывает открытые и без PnL, сортирует по выходу, понимает строки', () => {
    const list = closedTrades([
      tr({ pnl: 10, exit_at: '2026-11-03T00:00:00Z' }),
      tr({ pnl: null, exit_at: null }),
      tr({ pnl: '-5.5', exit_at: '2026-11-01T00:00:00Z' }),
      tr({ pnl: null, exit_at: '2026-11-02T00:00:00Z' }),
    ])
    expect(list.map((t) => t.pnl)).toEqual([-5.5, 10])
  })
})

describe('summarize', () => {
  const closed = closedTrades([
    tr({ pnl: 100, r_multiple: 2, exit_at: '2026-11-01T00:00:00Z' }),
    tr({ pnl: -50, r_multiple: -1, exit_at: '2026-11-02T00:00:00Z' }),
    tr({ pnl: 0, exit_at: '2026-11-03T00:00:00Z' }),
    tr({ pnl: 30, exit_at: '2026-11-04T00:00:00Z' }),
  ])
  const s = summarize(closed)

  it('winrate = прибыльные / закрытые (безубыток — не победа)', () => {
    expect(s.closed).toBe(4)
    expect(s.wins).toBe(2)
    expect(s.losses).toBe(1)
    expect(s.breakeven).toBe(1)
    expect(s.winrate).toBe(0.5)
  })
  it('PnL, средние, profit factor, матожидание', () => {
    expect(s.totalPnl).toBe(80)
    expect(s.avgWin).toBe(65)
    expect(s.avgLoss).toBe(-50)
    expect(s.profitFactor).toBeCloseTo(130 / 50)
    expect(s.expectancy).toBe(20)
    expect(s.best).toBe(100)
    expect(s.worst).toBe(-50)
  })
  it('средний R — только по сделкам со стопом', () => {
    expect(s.avgR).toBe(0.5)
    expect(s.rCount).toBe(2)
  })
  it('без убытков profit factor = ∞, пусто — null', () => {
    expect(summarize(closedTrades([tr({ pnl: 5 })])).profitFactor).toBe(Infinity)
    const empty = summarize([])
    expect(empty.profitFactor).toBeNull()
    expect(empty.winrate).toBeNull()
    expect(empty.expectancy).toBeNull()
    expect(empty.maxDrawdown).toBe(0)
  })
})

describe('drawdown', () => {
  const seqPnl = (pnls: number[]) =>
    closedTrades(pnls.map((pnl, i) => tr({ pnl, exit_at: `2026-11-01T0${i}:00:00Z` })))

  it('наибольшее падение от пика накопленного PnL', () => {
    // кривая: 100, 50, 150, 30, 80 → пик 150, дно 30 → 120
    expect(drawdown(seqPnl([100, -50, 100, -120, 50])).usd).toBe(120)
  })
  it('убыток с первой сделки — тоже просадка (пик = 0)', () => {
    expect(drawdown(seqPnl([-40, 10])).usd).toBe(40)
  })
  it('в процентах — от капитала на пике (депозит + PnL)', () => {
    // депозит 1000: пик 1150, дно 1030 → 120/1150
    expect(drawdown(seqPnl([100, -50, 100, -120, 50]), 1000).pct).toBeCloseTo(120 / 1150)
  })
  it('без депозита процент не считается', () => {
    expect(drawdown(seqPnl([-10]), null).pct).toBeNull()
    expect(drawdown(seqPnl([-10]), 0).pct).toBeNull()
  })
})

describe('equityCurve', () => {
  it('начинается с нуля и копит PnL', () => {
    const curve = equityCurve(closedTrades([tr({ pnl: 10, exit_at: '2026-11-01T00:00:00Z' }), tr({ pnl: -4, exit_at: '2026-11-02T00:00:00Z' })]))
    expect(curve.map((p) => p.cum)).toEqual([0, 10, 6])
    expect(curve.map((p) => p.n)).toEqual([0, 1, 2])
  })
})

describe('часовой пояс', () => {
  it('zonedParts: дата, час и день недели в поясе пользователя', () => {
    // 2026-11-01 22:30 UTC = 2026-11-02 01:30 в Москве (UTC+3), понедельник
    expect(zonedParts('2026-11-01T22:30:00Z', 'Europe/Moscow')).toEqual({ date: '2026-11-02', hour: 1, weekday: 0 })
    expect(zonedParts('2026-11-01T22:30:00Z', 'UTC')).toEqual({ date: '2026-11-01', hour: 22, weekday: 6 })
  })
  it('неизвестный пояс не роняет расчёт (считаем в UTC)', () => {
    expect(zonedParts('2026-11-01T22:30:00Z', 'Mars/Olympus').hour).toBe(22)
  })
  it('pnlByDay группирует по дате выхода в поясе пользователя', () => {
    const closed = closedTrades([
      tr({ pnl: 10, exit_at: '2026-11-01T22:30:00Z' }),
      tr({ pnl: 5, exit_at: '2026-11-02T08:00:00Z' }),
    ])
    expect(pnlByDay(closed, 'Europe/Moscow')).toEqual([{ date: '2026-11-02', pnl: 15, count: 2 }])
    expect(pnlByDay(closed, 'UTC').map((d) => d.date)).toEqual(['2026-11-01', '2026-11-02'])
  })
  it('byWeekday / byHour — по времени входа, все дни и часы на месте', () => {
    const closed = closedTrades([tr({ pnl: 10, entry_at: '2026-11-01T22:30:00Z' })])
    const wd = byWeekday(closed, 'Europe/Moscow')
    expect(wd).toHaveLength(7)
    expect(wd[0].pnl).toBe(10) // понедельник в Москве
    const hours = byHour(closed, 'Europe/Moscow')
    expect(hours).toHaveLength(24)
    expect(hours[1].count).toBe(1)
  })
})

describe('группировки', () => {
  const closed = closedTrades([
    tr({ pnl: 100, setup_id: 'A', r_multiple: 2, tagIds: [] }),
    tr({ pnl: -30, setup_id: 'A', r_multiple: -1, tagIds: ['fomo'] }),
    tr({ pnl: -50, setup_id: 'B', side: 'short', tagIds: ['fomo', 'nostop'] }),
    tr({ pnl: 20, setup_id: null, side: 'short', tagIds: ['nostop'] }),
  ])

  it('bySetup: PnL, winrate, средний R; сортировка по PnL', () => {
    const g = bySetup(closed)
    expect(g.map((x) => x.key)).toEqual(['A', null, 'B'])
    expect(g[0]).toMatchObject({ count: 2, wins: 1, winrate: 0.5, pnl: 70, avgR: 0.5 })
    expect(g[2].avgR).toBeNull()
  })
  it('bySide: всегда long и short', () => {
    const g = bySide(closed)
    expect(g.map((x) => x.key)).toEqual(['long', 'short'])
    expect(g[1]).toMatchObject({ count: 2, pnl: -30 })
    expect(bySide([]).map((x) => x.count)).toEqual([0, 0])
  })
  it('topMistakes: сумма убытков, сделка с двумя тегами — в обоих', () => {
    const g = topMistakes(closed)
    expect(g.map((x) => [x.key, x.lossSum, x.count])).toEqual([
      ['fomo', -80, 2],
      ['nostop', -50, 2],
    ])
  })
})
