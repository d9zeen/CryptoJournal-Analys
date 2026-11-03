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
