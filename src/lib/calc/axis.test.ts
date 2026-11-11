import { describe, expect, it } from 'vitest'
import { niceAxis, niceStep } from './axis'

describe('niceStep', () => {
  it('круглые шаги', () => {
    expect(niceStep(0.7)).toBe(1)
    expect(niceStep(180)).toBe(200)
    expect(niceStep(230)).toBe(250)
    expect(niceStep(4100)).toBe(5000)
    expect(niceStep(0)).toBe(1)
  })
})

describe('niceAxis', () => {
  it('кривая около нуля и выше: низ — ноль, а не −2 тыс.', () => {
    const a = niceAxis([0, -40, 300, 1200, 3135])
    expect(a.lo).toBeLessThanOrEqual(-40)
    expect(a.lo).toBeGreaterThan(-1000)
    expect(a.hi).toBeGreaterThanOrEqual(3135)
    expect(a.hi).toBeLessThan(4500)
    // деления — кратные шагу, включают 0
    expect(a.ticks).toContain(0)
    const step = a.ticks[1] - a.ticks[0]
    for (const t of a.ticks) expect(Math.abs(t / step - Math.round(t / step))).toBeLessThan(1e-9)
  })

  it('только плюс: низ ровно 0', () => {
    const a = niceAxis([0, 50, 120])
    expect(a.lo).toBe(0)
    expect(a.ticks[0]).toBe(0)
    expect(a.hi).toBeGreaterThanOrEqual(120 * 1.08 - 1e-9)
  })

  it('только минус: верх 0 (минимум данных накрыт с запасом)', () => {
    const a = niceAxis([0, -300, -800])
    expect(a.hi).toBeGreaterThanOrEqual(0)
    expect(a.lo).toBeLessThanOrEqual(-800 - 800 * 0.08 + 1e-9)
  })

  it('пусто или все одинаковые — без NaN и с ненулевым диапазоном', () => {
    for (const a of [niceAxis([]), niceAxis([0, 0])]) {
      expect(a.hi).toBeGreaterThan(a.lo)
      for (const t of a.ticks) expect(Number.isNaN(t)).toBe(false)
    }
  })
})
