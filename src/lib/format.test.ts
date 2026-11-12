import { describe, expect, it } from 'vitest'
import { formatPnl, formatPnlShort, formatPrice, formatR, formatUsd, formatPercent, formatRatio } from './format'
import { setLang } from './locale'

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

describe('formatPnlShort — короткая сумма для клетки календаря', () => {
  it('ru: без копеек, от 10 000 — K, от миллиона — M', () => {
    expect(n(formatPnlShort(214.61))).toBe('+215 $')
    expect(n(formatPnlShort(-145.37))).toBe('−145 $')
    expect(n(formatPnlShort(4742.15))).toBe('+4 742 $')
    expect(n(formatPnlShort(9999.4))).toBe('+9 999 $')
    expect(n(formatPnlShort(12_361.73))).toBe('+12,4K $')
    expect(n(formatPnlShort(-10_000))).toBe('−10K $')
    expect(n(formatPnlShort(1_234_567))).toBe('+1,2M $')
    expect(n(formatPnlShort(0.3))).toBe('0 $')
    expect(formatPnlShort(null)).toBe('—')
  })
  it('en: знак доллара впереди, точка', () => {
    setLang('en')
    try {
      expect(formatPnlShort(214.61)).toBe('+$215')
      expect(formatPnlShort(-4742.15)).toBe('−$4,742')
      expect(formatPnlShort(12_361.73)).toBe('+$12.4K')
    } finally {
      setLang('ru')
    }
  })
})
