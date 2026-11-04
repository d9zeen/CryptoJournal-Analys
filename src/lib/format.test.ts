import { describe, expect, it } from 'vitest'
import { formatPnl, formatPrice, formatR, formatUsd, formatPercent, formatRatio } from './format'

// Intl в русской локали ставит неразрывные пробелы — для сравнения заменяем на обычные
const n = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ')

describe('formatPrice', () => {
  it.each([
    [60000.123, '60 000,12'],
    [3.14159, '3,1416'],
    [0.5, '0,5'],
    [0.0000012345, '0,0000012345'],
    [0.00001234567, '0,0000123457'],
    [0, '0'],
  ])('%s → %s', (v, s) => expect(n(formatPrice(v))).toBe(s))
  it('пусто', () => expect(formatPrice(null)).toBe('—'))
})

describe('деньги, R, проценты', () => {
  it('PnL со знаком', () => {
    expect(n(formatPnl(12.5))).toBe('+12,50 $')
    expect(n(formatPnl(-3))).toBe('−3,00 $')
    expect(n(formatPnl(0))).toBe('0,00 $')
  })
  it('USD, R, %', () => {
    expect(n(formatUsd(1234.5))).toBe('1 234,50 $')
    expect(formatR(-1.256)).toBe('−1,26R')
    expect(n(formatPercent(0.523))).toBe('52,3 %')
    expect(formatRatio(Infinity)).toBe('∞')
    expect(formatRatio(null)).toBe('—')
  })
})
