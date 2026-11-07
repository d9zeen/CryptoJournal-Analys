import { describe, expect, it } from 'vitest'
import { recentForm } from './stats'

const tr = (...pnl: number[]) => pnl.map((p) => ({ pnl: p }))

describe('recentForm', () => {
  it('считает только последние n сделок, самая новая — последней', () => {
    const f = recentForm(tr(-5, 10, -3, 7, 8, 0, -1), 5)
    expect(f.items).toEqual(['loss', 'win', 'win', 'even', 'loss'])
    expect([f.wins, f.losses, f.even]).toEqual([2, 2, 1])
  })

  it('серия с конца: сделки в ноль не прерывают и не считаются', () => {
    expect(recentForm(tr(-1, 5, 6, 0, 7), 10).streak).toEqual({ kind: 'win', length: 3 })
    expect(recentForm(tr(5, -1, -2), 10).streak).toEqual({ kind: 'loss', length: 2 })
  })

  it('серия может быть длиннее окна', () => {
    expect(recentForm(tr(1, 2, 3, 4, 5, 6), 3).streak).toEqual({ kind: 'win', length: 6 })
  })

  it('сделок меньше n или нет вовсе', () => {
    const f = recentForm(tr(4), 10)
    expect(f.items).toEqual(['win'])
    const empty = recentForm([], 10)
    expect(empty.items).toEqual([])
    expect(empty.streak).toBeNull()
    expect(recentForm(tr(0, 0), 5).streak).toBeNull()
  })
})
