import { describe, expect, it } from 'vitest'
import { bybitClosedToTrade, checkBybitKey, fetchBybitTrades, type BybitCall, type BybitClosedPnl } from './bybit'

const base: BybitClosedPnl = {
  symbol: 'BTCUSDT',
  orderId: 'abc-1',
  side: 'Sell',
  closedSize: '0.01',
  cumEntryValue: '600',
  avgEntryPrice: '60000',
  cumExitValue: '610',
  avgExitPrice: '61000',
  closedPnl: '9.4',
  leverage: '10',
  createdTime: '1730000000000',
  updatedTime: '1730000100000',
}

describe('bybitClosedToTrade', () => {
  it('Sell закрывает лонг; комиссии — разница между валовым PnL и PnL биржи', () => {
    const t = bybitClosedToTrade(base, 'linear')!
    expect(t).toMatchObject({ exchange: 'bybit', market_type: 'linear', symbol: 'BTCUSDT', side: 'long', entry_price: 60000, exit_price: 61000, size_usd: 600, leverage: 10, pnl: 9.4, external_id: 'o:abc-1' })
    expect(t.fee).toBeCloseTo(0.6)
    expect(t.funding).toBe(0)
    expect(t.exit_at).toBe(new Date(1730000100000).toISOString())
  })

  it('Buy закрывает шорт', () => {
    const t = bybitClosedToTrade({ ...base, side: 'Buy', avgExitPrice: '59000', closedPnl: '9.5' }, 'linear')!
    expect(t.side).toBe('short')
    expect(t.fee).toBeCloseTo(0.5)
  })

  it('отдельные комиссии: остаток до PnL — фандинг', () => {
    const t = bybitClosedToTrade({ ...base, openFee: '0.33', closeFee: '0.34', closedPnl: '9.0' }, 'linear')!
    expect(t.fee).toBeCloseTo(0.67)
    expect(t.funding).toBeCloseTo(-0.33)
  })

  it('неполная запись — пропуск', () => {
    expect(bybitClosedToTrade({ ...base, avgEntryPrice: '0' }, 'linear')).toBeNull()
    expect(bybitClosedToTrade({ ...base, closedPnl: '' }, 'linear')).toBeNull()
  })
})

describe('fetchBybitTrades', () => {
  it('окна по 7 дней, страницы по курсору, обе категории', async () => {
    const calls: Record<string, unknown>[] = []
    const call: BybitCall = async (_path, params) => {
      calls.push(params)
      if (params.category === 'linear' && params.startTime === 0 && !params.cursor)
        return { retCode: 0, retMsg: 'OK', result: { list: [base], nextPageCursor: 'next' } }
      if (params.cursor === 'next') return { retCode: 0, retMsg: 'OK', result: { list: [{ ...base, orderId: 'abc-2' }], nextPageCursor: '' } }
      return { retCode: 0, retMsg: 'OK', result: { list: [], nextPageCursor: '' } }
    }
    const trades = await fetchBybitTrades(call, 0, 10 * 86_400_000)
    expect(trades.map((t) => t.external_id).sort()).toEqual(['o:abc-1', 'o:abc-2'])
    // 2 окна × 2 категории + 1 страница
    expect(calls).toHaveLength(5)
    expect(calls.every((c) => Number(c.endTime) - Number(c.startTime) < 7 * 86_400_000)).toBe(true)
  })

  it('ошибка биржи — исключение с кодом', async () => {
    const call: BybitCall = async () => ({ retCode: 10003, retMsg: 'API key is invalid.', result: {} })
    await expect(fetchBybitTrades(call, 0, 1000)).rejects.toMatchObject({ code: 10003 })
  })
})

describe('checkBybitKey', () => {
  it('readOnly = 1 → только чтение', async () => {
    const call: BybitCall = async () => ({ retCode: 0, retMsg: 'OK', result: { readOnly: 1, expiredAt: '2027-01-01T00:00:00Z' } })
    expect(await checkBybitKey(call)).toEqual({ readOnly: true, expiresAt: '2027-01-01T00:00:00Z' })
  })
  it('ключ с правом торговли', async () => {
    const call: BybitCall = async () => ({ retCode: 0, retMsg: 'OK', result: { readOnly: 0 } })
    expect((await checkBybitKey(call)).readOnly).toBe(false)
  })
})
