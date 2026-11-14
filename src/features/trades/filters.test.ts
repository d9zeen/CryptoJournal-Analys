import { describe, expect, it } from 'vitest'
import { applyFilters, EMPTY_FILTERS } from './filters'
import type { TradeWithTags } from '@/types/db'

const base = { exchange: 'bybit', side: 'long', exit_at: '2026-11-01T10:00:00Z', setup_id: 's1', symbol: 'BTCUSDT', trade_mistakes: [] }
const trades = [
  { ...base, id: '1' },
  { ...base, id: '2', side: 'short', exchange: 'okx', symbol: 'ETHUSDT', trade_mistakes: [{ tag_id: 'fomo' }] },
  { ...base, id: '3', exit_at: null, setup_id: null },
] as unknown as TradeWithTags[]
const ids = (f: Partial<typeof EMPTY_FILTERS>) => applyFilters(trades, { ...EMPTY_FILTERS, ...f }).map((t) => t.id)

describe('applyFilters', () => {
  it('без фильтров — всё', () => expect(ids({})).toEqual(['1', '2', '3']))
  it('по бирже', () => expect(ids({ exchange: 'okx' })).toEqual(['2']))
  it('по направлению', () => expect(ids({ side: 'long' })).toEqual(['1', '3']))
  it('открытые / закрытые', () => {
    expect(ids({ status: 'open' })).toEqual(['3'])
    expect(ids({ status: 'closed' })).toEqual(['1', '2'])
  })
  it('по сетапу и тегу ошибки', () => {
    expect(ids({ setupId: 's1' })).toEqual(['1', '2'])
    expect(ids({ tagId: 'fomo' })).toEqual(['2'])
  })
  it('по паре без учёта регистра', () => expect(ids({ symbol: 'eth' })).toEqual(['2']))
})

import { DEFAULT_SORT, durationMs, fromParams, hiddenFiltersCount, sortTrades, toParams } from './filters'
const mk = (id: string, over: Record<string, unknown>) =>
  ({ id, exchange: 'bybit', side: 'long', entry_at: '2026-11-01T10:00:00Z', exit_at: '2026-11-01T11:00:00Z', setup_id: null, emotion_id: null,
     symbol: 'BTCUSDT', title: null, size_usd: 100, pnl: 0, r_multiple: null, trade_mistakes: [], ...over }) as unknown as TradeWithTags

describe('быстрые фильтры и адрес', () => {
  const list = [mk('w', { pnl: 50, emotion_id: 'calm' }), mk('l', { pnl: -20 }), mk('o', { pnl: null, exit_at: null })]
  it('плюс / минус — по PnL, открытые не попадают; эмоция', () => {
    expect(applyFilters(list, { ...EMPTY_FILTERS, result: 'win' }).map((t) => t.id)).toEqual(['w'])
    expect(applyFilters(list, { ...EMPTY_FILTERS, result: 'loss' }).map((t) => t.id)).toEqual(['l'])
    expect(applyFilters(list, { ...EMPTY_FILTERS, emotionId: 'calm' }).map((t) => t.id)).toEqual(['w'])
  })
  it('в адрес и обратно; число скрытых фильтров', () => {
    const f = { ...EMPTY_FILTERS, side: 'long' as const, result: 'win' as const, setupId: 's1', tagId: 'fomo', symbol: 'btc' }
    const p = toParams(new URLSearchParams('day=2026-11-04'), f, { key: 'pnl', dir: 'asc' })
    expect(p.toString()).toBe('day=2026-11-04&side=long&result=win&setup=s1&mistake=fomo&q=btc&sort=pnl&dir=asc')
    expect(fromParams(p)).toEqual({ filters: f, sort: { key: 'pnl', dir: 'asc' } })
    expect(hiddenFiltersCount(f)).toBe(1)
    // по умолчанию в адресе ничего лишнего; мусор в адресе — игнорируется
    expect(toParams(new URLSearchParams(), EMPTY_FILTERS, DEFAULT_SORT).toString()).toBe('')
    expect(fromParams(new URLSearchParams('side=up&sort=hack'))).toEqual({ filters: EMPTY_FILTERS, sort: DEFAULT_SORT })
  })
})

describe('sortTrades', () => {
  const list = [
    mk('a', { pnl: 10, entry_at: '2026-11-01T10:00:00Z', symbol: 'ETHUSDT', size_usd: 300 }),
    mk('b', { pnl: -50, entry_at: '2026-11-03T10:00:00Z', symbol: 'BTCUSDT', size_usd: 100, r_multiple: -1 }),
    mk('c', { pnl: null, exit_at: null, entry_at: '2026-11-02T10:00:00Z', symbol: 'SOLUSDT', size_usd: 200 }),
    mk('d', { pnl: 90, entry_at: '2026-11-04T10:00:00Z', exit_at: '2026-11-04T14:12:00Z', symbol: 'ADAUSDT', size_usd: 50, r_multiple: 2 }),
  ]
  const ids = (key: Parameters<typeof sortTrades>[1]['key'], dir: 'asc' | 'desc') => sortTrades(list, { key, dir }).map((t) => t.id)
  it('по умолчанию — дата, новые сверху', () => expect(ids('date', 'desc')).toEqual(['d', 'b', 'c', 'a']))
  it('PnL: по убыванию и возрастанию, открытая — в конце всегда', () => {
    expect(ids('pnl', 'desc')).toEqual(['d', 'a', 'b', 'c'])
    expect(ids('pnl', 'asc')).toEqual(['b', 'a', 'd', 'c'])
  })
  it('пара, размер, R, «в сделке»', () => {
    expect(ids('symbol', 'asc')).toEqual(['d', 'b', 'a', 'c'])
    expect(ids('size', 'desc')).toEqual(['a', 'c', 'b', 'd'])
    expect(ids('r', 'desc')).toEqual(['d', 'b', 'c', 'a'])
    expect(ids('duration', 'desc')).toEqual(['d', 'a', 'b', 'c']) // у b выход раньше входа → 0
  })
  it('durationMs: открытая — null', () => {
    expect(durationMs(list[3])).toBe((4 * 60 + 12) * 60_000)
    expect(durationMs(list[2])).toBeNull()
  })
})
