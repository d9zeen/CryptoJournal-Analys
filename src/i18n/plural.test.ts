import { describe, expect, it } from 'vitest'
import { plural } from './index'

describe('plural', () => {
  const f = { one: '{n} сделка', few: '{n} сделки', many: '{n} сделок' }
  it('русские формы', () => {
    expect([1, 2, 5, 11, 21, 22, 25].map((n) => plural(n, f))).toEqual(['1 сделка', '2 сделки', '5 сделок', '11 сделок', '21 сделка', '22 сделки', '25 сделок'])
  })
})
