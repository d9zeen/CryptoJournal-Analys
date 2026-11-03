import { describe, expect, it } from 'vitest'
import { grossPnl, inversePnlCoin, isStopOnWrongSide, marginUsd, netPnl, qtyCoins, rMultiple, riskUsd } from './trade'

describe('PnL: USDT-фьючерсы (linear)', () => {
  it('long в плюс: 0.1 BTC с 60 000 до 61 000 = +100$', () => {
    const t = { marketType: 'linear', side: 'long', entryPrice: 60000, exitPrice: 61000, sizeUsd: 6000 } as const
    expect(grossPnl(t)).toBeCloseTo(100)
  })
  it('комиссия вычитается, фандинг со знаком учитывается', () => {
    const t = { marketType: 'linear', side: 'long', entryPrice: 60000, exitPrice: 61000, sizeUsd: 6000, fee: 6, funding: -1 } as const
    expect(netPnl(t)).toBeCloseTo(93)
    expect(netPnl({ ...t, funding: 2.5 })).toBeCloseTo(96.5)
  })
  it('short в плюс: 1 ETH с 3000 до 2900 = +100$', () => {
    expect(grossPnl({ marketType: 'linear', side: 'short', entryPrice: 3000, exitPrice: 2900, sizeUsd: 3000 })).toBeCloseTo(100)
  })
  it('short в минус', () => {
    expect(grossPnl({ marketType: 'linear', side: 'short', entryPrice: 3000, exitPrice: 3150, sizeUsd: 3000 })).toBeCloseTo(-150)
  })
  it('плечо на PnL в $ не влияет — только размер позиции', () => {
    expect(marginUsd(6000, 10)).toBe(600)
    expect(marginUsd(6000, 1)).toBe(6000)
  })
  it('открытая сделка — PnL нет', () => {
    expect(netPnl({ marketType: 'linear', side: 'long', entryPrice: 100, exitPrice: null, sizeUsd: 100 })).toBeNull()
  })
})

describe('PnL: инверсные контракты (coin-margined)', () => {
  it('long 10 000$ BTCUSD с 50 000 до 55 000: в монете 0.01818 BTC, в USD 1000$', () => {
    const t = { marketType: 'inverse', side: 'long', entryPrice: 50000, exitPrice: 55000, sizeUsd: 10000 } as const
    expect(inversePnlCoin(t)).toBeCloseTo(0.0181818, 6)
    expect(grossPnl(t)).toBeCloseTo(1000)
  })
  it('short 10 000$ с 50 000 до 40 000: +0.05 BTC = 2000$ по цене выхода', () => {
    const t = { marketType: 'inverse', side: 'short', entryPrice: 50000, exitPrice: 40000, sizeUsd: 10000 } as const
    expect(inversePnlCoin(t)).toBeCloseTo(0.05, 8)
    expect(grossPnl(t)).toBeCloseTo(2000)
  })
})

describe('PnL: спот', () => {
  it('купил 2 SOL по 150, продал по 180 = +60$', () => {
    expect(grossPnl({ marketType: 'spot', side: 'long', entryPrice: 150, exitPrice: 180, sizeUsd: 300 })).toBeCloseTo(60)
    expect(qtyCoins(300, 150)).toBe(2)
  })
})

describe('Риск и R-multiple', () => {
  it('long: вход 60 000, стоп 59 000, размер 6000$ → риск 100$', () => {
    expect(riskUsd({ entryPrice: 60000, sizeUsd: 6000, stopLoss: 59000 })).toBeCloseTo(100)
  })
  it('short: вход 3000, стоп 3090, размер 3000$ → риск 90$', () => {
    expect(riskUsd({ entryPrice: 3000, sizeUsd: 3000, stopLoss: 3090 })).toBeCloseTo(90)
  })
  it('R = PnL / риск', () => {
    expect(rMultiple(93, 100)).toBeCloseTo(0.93)
    expect(rMultiple(-100, 100)).toBeCloseTo(-1)
    expect(rMultiple(250, 100)).toBeCloseTo(2.5)
  })
  it('без стопа R не считается', () => {
    expect(riskUsd({ entryPrice: 100, sizeUsd: 100, stopLoss: null })).toBeNull()
    expect(rMultiple(50, null)).toBeNull()
  })
  it('стоп равен входу — риск 0, R не считается', () => {
    expect(riskUsd({ entryPrice: 100, sizeUsd: 100, stopLoss: 100 })).toBeNull()
  })
  it('стоп не с той стороны', () => {
    expect(isStopOnWrongSide('long', 100, 105)).toBe(true)
    expect(isStopOnWrongSide('long', 100, 95)).toBe(false)
    expect(isStopOnWrongSide('short', 100, 95)).toBe(true)
    expect(isStopOnWrongSide('short', 100, null)).toBe(false)
  })
})
