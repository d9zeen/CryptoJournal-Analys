import { describe, expect, it } from 'vitest'
import { parseDecimal, toInput } from './parse'

describe('parseDecimal', () => {
  it.each([
    ['0,5', 0.5], ['0.5', 0.5], ['1 234,56', 1234.56], ['-12.5', -12.5], ['  42 ', 42], ['.5', 0.5],
  ])('%s → %s', (input, expected) => expect(parseDecimal(input)).toBe(expected))
  it.each(['', 'abc', '1,2,3', '--1', '1.2.3'])('%s → null', (input) => expect(parseDecimal(input)).toBeNull())
})

describe('toInput', () => {
  it('убирает хвосты float', () => {
    expect(toInput(0.1 + 0.2)).toBe('0.3')
    expect(toInput(null)).toBe('')
    expect(toInput(60000)).toBe('60000')
  })
})
