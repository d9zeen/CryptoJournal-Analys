import { describe, expect, it } from 'vitest'
import { buildTrade, emptyForm, normalizeSymbol, type FormState } from './formLogic'

const base = { id: 'id-1', screenshot_path: null }
const valid = (over: Partial<FormState> = {}) =>
  emptyForm({
    symbol: 'btcusdt',
    entryAt: '2026-11-01T10:00',
    exitAt: '2026-11-01T12:00',
    entryPrice: '60000',
    exitPrice: '61 000',
    sizeUsd: '6000',
    leverage: '10',
    stopLoss: '59000',
    fee: '6',
    funding: '-1',
    ...over,
  })

describe('buildTrade', () => {
  it('закрытая сделка: считает PnL и R', () => {
    const { trade, errors } = buildTrade(valid(), base)
    expect(errors).toEqual({})
    expect(trade!.symbol).toBe('BTCUSDT')
    expect(trade!.pnl).toBeCloseTo(93)
    expect(trade!.r_multiple).toBeCloseTo(0.93)
    expect(trade!.pnl_manual).toBe(false)
  })
  it('открытая сделка: без выхода и без PnL', () => {
    const { trade } = buildTrade(valid({ isClosed: false, exitPrice: '' }), base)
    expect(trade!.exit_at).toBeNull()
    expect(trade!.exit_price).toBeNull()
    expect(trade!.pnl).toBeNull()
    expect(trade!.r_multiple).toBeNull()
  })
  it('ручной PnL перекрывает расчёт, R считается от него', () => {
    const { trade } = buildTrade(valid({ pnlManual: true, pnl: '150' }), base)
    expect(trade!.pnl).toBe(150)
    expect(trade!.pnl_manual).toBe(true)
    expect(trade!.r_multiple).toBeCloseTo(1.5)
  })
  it('спот: принудительно long и плечо 1', () => {
    const { trade } = buildTrade(valid({ marketType: 'spot', side: 'short', leverage: '20' }), base)
    expect(trade!.side).toBe('long')
    expect(trade!.leverage).toBe(1)
  })
  it('ошибки обязательных полей', () => {
    const { trade, errors } = buildTrade(emptyForm({ symbol: '', entryPrice: '', sizeUsd: 'abc' }), base)
    expect(trade).toBeNull()
    expect(errors.symbol).toBe('symbol')
    expect(errors.entryPrice).toBe('entryPrice')
    expect(errors.sizeUsd).toBe('number')
    expect(errors.exitPrice).toBe('exitPrice')
  })
  it('выход раньше входа', () => {
    const { errors } = buildTrade(valid({ exitAt: '2026-11-01T09:00' }), base)
    expect(errors.exitAt).toBe('exitBeforeEntry')
  })
  it('отрицательная комиссия и плечо вне диапазона', () => {
    const { errors } = buildTrade(valid({ fee: '-5', leverage: '0.5' }), base)
    expect(errors.fee).toBe('fee')
    expect(errors.leverage).toBe('leverage')
  })
  it('пустые необязательные поля → null/0', () => {
    const { trade } = buildTrade(valid({ stopLoss: '', fee: '', funding: '' }), base)
    expect(trade!.stop_loss).toBeNull()
    expect(trade!.fee).toBe(0)
    expect(trade!.r_multiple).toBeNull()
  })
})

describe('normalizeSymbol', () => {
  it('приводит к верхнему регистру и убирает пробелы', () => expect(normalizeSymbol(' eth usdt ')).toBe('ETHUSDT'))
})
