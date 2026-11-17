import { describe, expect, it } from 'vitest'
import { buildCurve } from './curve'

const T = (ex: string, h: number, pnl: number | null, closed = true) => ({ exchange: ex, exit_at: closed ? new Date(Date.UTC(2026, 10, 1, h)).toISOString() : null, pnl })

describe('buildCurve — кривая «Сделки собирают кривую»', () => {
  it('все закрытые сделки подключённых бирж по времени закрытия; начало — 0', () => {
    const c = buildCurve([T('okx', 3, 30), T('bybit', 1, 10), T('bybit', 2, -5), T('binance', 4, 999), T('bybit', 5, null), T('bybit', 6, 7, false)], ['bybit', 'okx'])
    expect(c.values).toEqual([0, 10, 5, 35])
    expect(c.from).toEqual(['bybit', 'bybit', 'bybit', 'okx'])
    expect(c.count).toBe(3)
    expect(c.perExchange.get('bybit')).toBe(2)
    expect(c.perExchange.get('okx')).toBe(1)
    expect(c.since).toBe(new Date(Date.UTC(2026, 10, 1, 1)).toISOString())
  })

  it('нет сделок — одна точка 0, since = null', () => {
    const c = buildCurve([], ['bybit'])
    expect(c.values).toEqual([0])
    expect(c.count).toBe(0)
    expect(c.since).toBeNull()
  })

  it('тысячи сделок — не больше max точек, итог, максимум и минимум на месте', () => {
    const trades = Array.from({ length: 5000 }, (_, i) => T('bybit', i, i === 2500 ? 10_000 : i === 4000 ? -20_000 : 1))
    const c = buildCurve(trades, ['bybit'], 300)
    expect(c.values.length).toBeLessThanOrEqual(300)
    expect(c.count).toBe(5000)
    const full: number[] = [0]
    trades.forEach((t) => full.push(full[full.length - 1] + Number(t.pnl)))
    expect(c.values[c.values.length - 1]).toBe(full[full.length - 1])
    expect(Math.max(...c.values)).toBe(Math.max(...full))
    expect(Math.min(...c.values)).toBe(Math.min(...full))
  })
})
