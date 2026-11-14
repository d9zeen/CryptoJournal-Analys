import { describe, expect, it } from 'vitest'
import { compareKpis, kpiSnapshot, type KpiSnapshot } from './compare'
import { closedTrades, summarize } from './stats'

const snap = (over: Partial<KpiSnapshot> = {}): KpiSnapshot => ({ count: 10, pnl: 500, winrate: 0.6, profitFactor: 2, dayWinrate: 0.5, winLoss: 1.5, ...over })

describe('compareKpis — сравнение с прошлым периодом', () => {
  it('прошлого периода нет или в нём 0 сделок — сравнения нет', () => {
    expect(compareKpis(snap(), null)).toBeNull()
    expect(compareKpis(snap(), snap({ count: 0, pnl: 0, winrate: null, profitFactor: null, dayWinrate: null, winLoss: null }))).toBeNull()
  })

  it('PnL — разница в $, винрейты — в п.п., PF и выигрыш / проигрыш — «было»', () => {
    const d = compareKpis(snap({ pnl: 812.5, winrate: 0.56, profitFactor: 2.2, dayWinrate: 0.625, winLoss: 1.2 }), snap())!
    expect(d.pnl).toEqual({ kind: 'usd', delta: 312.5, dir: 'up' })
    expect(d.winrate).toEqual({ kind: 'pp', delta: -4, dir: 'down' })
    expect(d.dayWinrate).toEqual({ kind: 'pp', delta: 12.5, dir: 'up' })
    expect(d.profitFactor).toEqual({ kind: 'was', prev: 2, dir: 'up' })
    expect(d.winLoss).toEqual({ kind: 'was', prev: 1.5, dir: 'down' })
  })

  it('отрицательный PnL: из минуса в меньший минус — лучше, без «процентов от минуса»', () => {
    const d = compareKpis(snap({ pnl: -100 }), snap({ pnl: -400 }))!
    expect(d.pnl).toEqual({ kind: 'usd', delta: 300, dir: 'up' })
    const worse = compareKpis(snap({ pnl: -250.4 }), snap({ pnl: 120 }))!
    expect(worse.pnl).toEqual({ kind: 'usd', delta: -370.4, dir: 'down' })
  })

  it('нет значения в одном из периодов — эта плашка не показывается; убытков не было (∞) — лучше любого числа', () => {
    const d = compareKpis(snap({ winrate: null, profitFactor: Infinity, winLoss: null }), snap({ profitFactor: 3 }))!
    expect(d.winrate).toBeNull()
    expect(d.winLoss).toBeNull()
    expect(d.profitFactor).toEqual({ kind: 'was', prev: 3, dir: 'up' })
    expect(compareKpis(snap({ profitFactor: 2 }), snap({ profitFactor: Infinity }))!.profitFactor!.dir).toBe('down')
    expect(compareKpis(snap(), snap())!.pnl!.dir).toBe('same')
  })

  it('kpiSnapshot берёт числа из summarize', () => {
    const closed = closedTrades(
      [100, -50, 200, -25].map((pnl, i) => ({
        id: `t${i}`, side: 'long' as const, symbol: 'BTCUSDT', entry_at: `2026-11-0${i + 1}T10:00:00Z`, exit_at: `2026-11-0${i + 1}T12:00:00Z`,
        pnl, r_multiple: null, setup_id: null, emotion_id: null, tagIds: [],
      })),
    )
    const s = kpiSnapshot(summarize(closed), 0.5)
    expect(s).toMatchObject({ count: 4, pnl: 225, winrate: 0.5, profitFactor: 4, dayWinrate: 0.5 })
    expect(s.winLoss).toBeCloseTo(150 / 37.5, 6)
  })
})
