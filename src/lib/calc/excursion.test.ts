import { describe, expect, it } from 'vitest'
import { excursion } from './excursion'

const M = 60_000
const T0 = Date.UTC(2026, 10, 1, 10, 0)
const iso = (ms: number) => new Date(ms).toISOString()
// свечи по минуте: [high, low]
const candles = (hl: [number, number][], start = T0 - 2 * M) => hl.map(([h, l], i) => ({ t: start + i * M, h, l }))
const base = { entry_price: 100, entry_at: iso(T0), exit_at: iso(T0 + 3 * M), stop_loss: 98, size_usd: 1000 }

describe('excursion — MAE / MFE', () => {
  // до входа (не считаются) / во время сделки / после выхода (не считаются)
  const cs = candles([
    [130, 50], // до входа — далеко
    [130, 50],
    [101, 99.5], // свеча входа
    [104, 100.5], // лучшая для long
    [102, 99], // худшая для long
    [102.5, 101.5], // свеча выхода
    [200, 10], // после выхода
  ])

  it('long: лучшая и худшая точка только внутри сделки', () => {
    const e = excursion(cs, M, { ...base, side: 'long', exit_price: 102 })!
    expect(e.mfe).toBeCloseTo(4)
    expect(e.mae).toBeCloseTo(1)
    expect(e.mfePct).toBeCloseTo(0.04)
    expect(e.maePct).toBeCloseTo(0.01)
    // 10 монет (1000 $ / 100)
    expect(e.mfeUsd).toBeCloseTo(40)
    expect(e.maeUsd).toBeCloseTo(10)
    // риск — 2 (стоп 98)
    expect(e.mfeR).toBeCloseTo(2)
    expect(e.maeR).toBeCloseTo(0.5)
    // взял 2 из 4
    expect(e.efficiency).toBeCloseTo(0.5)
    expect(e.mfeAt).toBe(T0 + M)
    expect(e.maeAt).toBe(T0 + 2 * M)
  })

  it('short: зеркально', () => {
    const e = excursion(cs, M, { ...base, side: 'short', exit_price: 99.5, stop_loss: 103 })!
    expect(e.mfe).toBeCloseTo(1) // 100 − 99
    expect(e.mae).toBeCloseTo(4) // 104 − 100
    expect(e.efficiency).toBeCloseTo(0.5)
    expect(e.maeR).toBeCloseTo(4 / 3)
    expect(e.mfePrice).toBe(99)
    expect(e.maePrice).toBe(104)
  })

  it('выход и вход тоже в экстремумах (свечи другой биржи не дают MFE меньше результата)', () => {
    const e = excursion(candles([[100.2, 99.9], [100.3, 99.9]], T0), M, { ...base, side: 'long', exit_price: 105 })!
    expect(e.mfe).toBeCloseTo(5)
    expect(e.efficiency).toBe(1)
  })

  it('убыточная сделка: эффективность меньше нуля, MAE не меньше убытка', () => {
    const e = excursion(candles([[100.5, 99], [101, 97]], T0), M, { ...base, side: 'long', exit_price: 97.5 })!
    expect(e.mae).toBeCloseTo(3)
    expect(e.efficiency).toBeCloseTo(-2.5 / 1)
  })

  it('цена ни разу не ушла в плюс — эффективности нет', () => {
    const e = excursion(candles([[100, 99], [100, 98]], T0), M, { ...base, side: 'long', exit_price: 98.5 })!
    expect(e.mfe).toBe(0)
    expect(e.efficiency).toBeNull()
  })

  it('без стопа — нет R; открытая сделка — до «сейчас», без эффективности', () => {
    const e = excursion(cs, M, { ...base, side: 'long', exit_price: null, exit_at: null, stop_loss: null }, T0 + 3 * M)!
    expect(e.mfeR).toBeNull()
    expect(e.efficiency).toBeNull()
    expect(e.mfe).toBeCloseTo(4)
  })

  it('битая цена входа — null', () => {
    expect(excursion(cs, M, { ...base, side: 'long', exit_price: 1, entry_price: 0 })).toBeNull()
  })
})
