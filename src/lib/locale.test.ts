import { afterEach, describe, expect, it } from 'vitest'
import { getLang, setLang } from './locale'
import { formatDay, formatDayShort, formatPnl, formatUsd } from './format'
import { compactPnl } from './calc/calendar'
import { plural } from '@/i18n'

describe('английские форматы (язык по умолчанию на сайте)', () => {
  afterEach(() => setLang('ru'))

  it('деньги, даты и короткие суммы календаря — по-английски', () => {
    setLang('en')
    expect(getLang()).toBe('en')
    expect(formatUsd(1234.56)).toBe('$1,234.56')
    expect(formatPnl(-12)).toBe('−$12.00')
    expect(formatDayShort('2026-11-03')).toBe('Nov 3')
    expect(formatDay('2026-11-03')).toBe('Nov 3, 2026')
    expect(compactPnl(1652.68)).toBe('+1.7k')
    expect(compactPnl(-2_236_300)).toBe('−2.2M')
  })

  it('множественное число: 1 trade / 2 trades', () => {
    setLang('en')
    const f = { one: '{n} trade', few: '{n} trades', many: '{n} trades' }
    expect(plural(1, f)).toBe('1 trade')
    expect(plural(3, f)).toBe('3 trades')
  })

  it('по-русски — как раньше', () => {
    setLang('ru')
    expect(formatDayShort('2026-11-03')).toBe('03.11')
    expect(compactPnl(1652.68)).toBe('+1,7к')
  })
})
