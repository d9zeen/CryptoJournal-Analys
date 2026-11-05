import { describe, expect, it } from 'vitest'
import { fetchHlFills, hlFillsToTrades, hlSymbol, type HlFill } from './hyperliquid'

const f = (p: Partial<HlFill>): HlFill => ({ coin: 'BTC', px: '60000', sz: '0.1', side: 'B', time: 1, dir: 'Open Long', fee: '1.2', feeToken: 'USDC', oid: 1, tid: 1, ...p })

describe('hyperliquid', () => {
  it('символы', () => {
    expect(hlSymbol('BTC')).toBe('BTCUSDC')
    expect(hlSymbol('kPEPE')).toBe('KPEPEUSDC')
    expect(hlSymbol('xyz:TSLA')).toBe('XYZ-TSLAUSDC')
  })

  it('открытие + закрытие → одна сделка; курсор после последнего исполнения', () => {
    const fills = [
      f({ time: 1_000, oid: 1, tid: 1 }),
      f({ time: 2_000, oid: 2, tid: 2, side: 'A', px: '61000', dir: 'Close Long' }),
    ]
    const { trades, cursor } = hlFillsToTrades(fills)
    expect(trades).toHaveLength(1)
    expect(trades[0]).toMatchObject({ exchange: 'hyperliquid', symbol: 'BTCUSDC', side: 'long', entry_price: 60000, exit_price: 61000 })
    expect(trades[0].pnl).toBeCloseTo(100 - 2.4)
    expect(cursor).toBe(2_001)
  })

  it('незакрытая позиция: курсор — с её первого исполнения', () => {
    const fills = [
      f({ time: 1_000, oid: 1, tid: 1 }),
      f({ time: 2_000, oid: 2, tid: 2, side: 'A', px: '61000', dir: 'Close Long' }),
      f({ coin: 'ETH', px: '3000', sz: '1', side: 'A', time: 3_000, oid: 3, tid: 3, dir: 'Open Short' }),
    ]
    const { trades, cursor } = hlFillsToTrades(fills)
    expect(trades).toHaveLength(1)
    expect(cursor).toBe(3_000)
  })

  it('закрытие позиции, открытой до периода, пропускается', () => {
    const fills = [
      f({ time: 500, oid: 9, tid: 9, side: 'A', dir: 'Close Long', startPosition: '0.1' }),
      f({ time: 1_000, oid: 1, tid: 1, startPosition: '0' }),
      f({ time: 2_000, oid: 2, tid: 2, side: 'A', px: '61000', dir: 'Close Long', startPosition: '0.1' }),
    ]
    const { trades, cursor } = hlFillsToTrades(fills)
    expect(trades).toHaveLength(1)
    expect(cursor).toBe(2_001)
  })

  it('спот пропускается', () => {
    const { trades, cursor } = hlFillsToTrades([f({ coin: '@107', dir: 'Buy' }), f({ coin: 'PURR/USDC', dir: 'Sell', side: 'A' })])
    expect(trades).toHaveLength(0)
    expect(cursor).toBeNull()
  })

  it('загрузка страницами по 2000', async () => {
    const bodies: { startTime: number }[] = []
    const fake = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body))
      bodies.push(body)
      const n = bodies.length === 1 ? 2000 : 5
      return new Response(JSON.stringify(Array.from({ length: n }, (_, i) => f({ time: body.startTime + i, tid: i }))))
    }) as typeof fetch
    const all = await fetchHlFills('0xabc', 100, fake)
    expect(all).toHaveLength(2005)
    expect(bodies[1].startTime).toBe(100 + 1999 + 1)
  })
})
