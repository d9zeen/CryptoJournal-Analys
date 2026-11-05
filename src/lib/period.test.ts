import { describe, expect, it } from 'vitest'
import { rangeFor } from './period'

const empty = { from: '', to: '' }

describe('rangeFor', () => {
  it('неделя начинается с понедельника', () => {
    const r = rangeFor('week', empty, new Date(2026, 10, 5, 15, 0)) // чт 5 ноября 2026
    expect(new Date(r.from!).getDate()).toBe(2)
    expect(new Date(r.from!).getDay()).toBe(1)
    expect(new Date(r.to!).getDate()).toBe(9)
  })
  it('неделя в воскресенье — всё ещё текущая', () => {
    const r = rangeFor('week', empty, new Date(2026, 10, 8, 23, 0)) // вс 8 ноября
    expect(new Date(r.from!).getDate()).toBe(2)
  })
  it('месяц — с 1-го числа по 1-е следующего', () => {
    const r = rangeFor('month', empty, new Date(2026, 11, 15))
    expect(new Date(r.from!)).toEqual(new Date(2026, 11, 1))
    expect(new Date(r.to!)).toEqual(new Date(2027, 0, 1))
  })
  it('свой диапазон включает последний день', () => {
    const r = rangeFor('custom', { from: '2026-10-01', to: '2026-10-31' })
    expect(new Date(r.from!)).toEqual(new Date(2026, 9, 1))
    expect(new Date(r.to!)).toEqual(new Date(2026, 10, 1))
  })
  it('всё время — без границ', () => {
    expect(rangeFor('all', empty)).toEqual({ from: null, to: null })
  })
})

import { daysInRange, monthGrid, quickRange, ymd } from './period'

describe('календарь своего диапазона', () => {
  const now = new Date(2026, 10, 5, 15, 0) // чт 5 ноября 2026
  it('быстрые варианты', () => {
    expect(quickRange('today', now)).toEqual({ from: '2026-11-05', to: '2026-11-05' })
    expect(quickRange('yesterday', now)).toEqual({ from: '2026-11-04', to: '2026-11-04' })
    expect(quickRange('last7', now)).toEqual({ from: '2026-10-30', to: '2026-11-05' })
    expect(quickRange('last30', now)).toEqual({ from: '2026-10-07', to: '2026-11-05' })
    expect(quickRange('thisMonth', now)).toEqual({ from: '2026-11-01', to: '2026-11-05' })
    expect(quickRange('lastMonth', now)).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(quickRange('thisYear', now)).toEqual({ from: '2026-01-01', to: '2026-11-05' })
  })
  it('прошлый месяц в январе — декабрь прошлого года', () => {
    expect(quickRange('lastMonth', new Date(2027, 0, 10))).toEqual({ from: '2026-12-01', to: '2026-12-31' })
  })
  it('сетка месяца: 42 дня, с понедельника', () => {
    const g = monthGrid(2026, 10) // ноябрь 2026, 1-е — воскресенье
    expect(g).toHaveLength(42)
    expect(ymd(g[0])).toBe('2026-10-26')
    expect(g[0].getDay()).toBe(1)
    expect(ymd(g[6])).toBe('2026-11-01')
  })
  it('дней в диапазоне — включительно', () => {
    expect(daysInRange({ from: '2026-10-01', to: '2026-10-31' })).toBe(31)
    expect(daysInRange({ from: '2026-11-05', to: '2026-11-05' })).toBe(1)
    expect(daysInRange({ from: '', to: '' })).toBe(0)
  })
})
