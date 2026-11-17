import { describe, expect, it } from 'vitest'
import { formatDateTime, formatPercent, formatPnl, formatPnlShort, formatPrice, formatR, formatRatio, formatUsd, isoToLocalInput, localInputToIso, setDisplayTimeZone } from './format'
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

import { formatDuration } from './format'
describe('formatDuration — «В сделке»', () => {
  const MIN = 60_000
  it('ru: минуты, часы с минутами, дни с часами', () => {
    setLang('ru')
    expect(formatDuration(45 * MIN)).toBe('45 мин')
    expect(formatDuration((4 * 60 + 12) * MIN)).toBe('4 ч 12 мин')
    expect(formatDuration(2 * 60 * MIN)).toBe('2 ч')
    expect(formatDuration((3 * 1440 + 2 * 60 + 40) * MIN)).toBe('3 д 2 ч')
    expect(formatDuration(1440 * MIN)).toBe('1 д')
    expect(formatDuration(20_000)).toBe('< 1 мин')
    expect(formatDuration(null)).toBe('—')
  })
  it('en', () => {
    setLang('en')
    expect(formatDuration(45 * MIN)).toBe('45 min')
    expect(formatDuration((4 * 60 + 12) * MIN)).toBe('4 h 12 min')
    expect(formatDuration((3 * 1440 + 2 * 60) * MIN)).toBe('3 d 2 h')
    setLang('ru')
  })
})

describe('ноль — без знака (проверка перед запуском, 17.11.2026)', () => {
  it('сумма, которая округляется до нуля, — «0,00 $», а не «−0,00 $» / «+0,00 $»', () => {
    expect(n(formatPnl(-0.004))).toBe('0,00 $')
    expect(n(formatPnl(0.004))).toBe('0,00 $')
    expect(n(formatUsd(-0.004))).toBe('0,00 $')
    expect(n(formatUsd(-0))).toBe('0,00 $')
    expect(n(formatR(-0.001))).toBe('0,00R')
  })
  it('проценты: «0 %», а не «-0 %»', () => {
    expect(n(formatPercent(-0.0004))).toBe('0 %')
    expect(n(formatPercent(-0.5))).toBe('-50 %')
  })
})

describe('время — в поясе профиля (как дни календаря)', () => {
  it('показ и форма сделки в одном поясе: туда и обратно без сдвига', () => {
    setDisplayTimeZone('Asia/Tokyo')
    try {
      expect(isoToLocalInput('2026-11-04T23:30:00Z')).toBe('2026-11-05T08:30')
      expect(localInputToIso('2026-11-05T08:30')).toBe('2026-11-04T23:30:00.000Z')
      expect(formatDateTime('2026-11-04T23:30:00Z')).toContain('05.11')
      // переход на летнее время в Берлине: 29.03.2026 02:00 → 03:00
      setDisplayTimeZone('Europe/Berlin')
      expect(localInputToIso('2026-03-29T12:00')).toBe('2026-03-29T10:00:00.000Z')
      expect(localInputToIso('2026-03-28T12:00')).toBe('2026-03-28T11:00:00.000Z')
    } finally {
      setDisplayTimeZone(undefined)
    }
  })
})
