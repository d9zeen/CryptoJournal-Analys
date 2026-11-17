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

import { previousRange } from './period'
describe('previousRange — прошлый период той же длины', () => {
  const now = new Date(2026, 10, 12, 15) // чт, 12 ноября 2026
  const local = (iso: string | null) => (iso ? ymd(new Date(iso)) : null)
  it('месяц → прошлый календарный месяц (октябрь)', () => {
    const p = previousRange('month', { from: '', to: '' }, now)!
    expect([local(p.range.from), local(p.range.to), p.vs, p.month]).toEqual(['2026-10-01', '2026-11-01', 'month', 9])
  })
  it('январь → декабрь прошлого года', () => {
    const p = previousRange('month', { from: '', to: '' }, new Date(2026, 0, 10))!
    expect([local(p.range.from), local(p.range.to), p.month]).toEqual(['2025-12-01', '2026-01-01', 11])
  })
  it('неделя → прошлая неделя с понедельника', () => {
    const p = previousRange('week', { from: '', to: '' }, now)!
    expect([local(p.range.from), local(p.range.to), p.vs]).toEqual(['2026-11-02', '2026-11-09', 'week'])
  })
  it('свой диапазон → такой же отрезок прямо перед ним', () => {
    const p = previousRange('custom', { from: '2026-11-05', to: '2026-11-11' }, now)!
    expect([local(p.range.from), local(p.range.to), p.vs]).toEqual(['2026-10-29', '2026-11-05', 'custom'])
  })
  it('всё время и незаполненный диапазон — без сравнения', () => {
    expect(previousRange('all', { from: '', to: '' }, now)).toBeNull()
    expect(previousRange('custom', { from: '2026-11-05', to: '' }, now)).toBeNull()
  })
})

describe('границы — в поясе пользователя (как дни календаря)', () => {
  it('месяц в Москве: 23:30 UTC 30 ноября — там уже 1 декабря', () => {
    const r = rangeFor('month', empty, new Date('2026-11-30T22:30:00Z'), 'Europe/Moscow')
    expect(r).toEqual({ from: '2026-11-30T21:00:00.000Z', to: '2026-12-31T21:00:00.000Z' })
  })
  it('неделя в Токио — с понедельника по местному времени', () => {
    // вс 8 ноября 20:00 UTC = пн 9 ноября 05:00 в Токио
    const r = rangeFor('week', empty, new Date('2026-11-08T20:00:00Z'), 'Asia/Tokyo')
    expect(r.from).toBe('2026-11-08T15:00:00.000Z')
    expect(r.to).toBe('2026-11-15T15:00:00.000Z')
  })
  it('день из календаря (?day=) — ровно сутки пояса, даже в день перехода на летнее время', () => {
    expect(rangeFor('custom', { from: '2026-03-29', to: '2026-03-29' }, new Date(), 'Europe/Berlin')).toEqual({ from: '2026-03-28T23:00:00.000Z', to: '2026-03-29T22:00:00.000Z' })
    expect(rangeFor('custom', { from: '2026-11-04', to: '2026-11-04' }, new Date(), 'UTC')).toEqual({ from: '2026-11-04T00:00:00.000Z', to: '2026-11-05T00:00:00.000Z' })
  })
  it('прошлый месяц для сравнения — тоже в поясе', () => {
    const p = previousRange('month', empty, new Date('2026-11-30T22:30:00Z'), 'Europe/Moscow')!
    expect(p.range).toEqual({ from: '2026-10-31T21:00:00.000Z', to: '2026-11-30T21:00:00.000Z' })
    expect(p.month).toBe(10)
  })
  it('«сегодня» в быстрых вариантах — по поясу', () => {
    expect(quickRange('today', new Date('2026-11-30T22:30:00Z'), 'Europe/Moscow')).toEqual({ from: '2026-12-01', to: '2026-12-01' })
  })
})
