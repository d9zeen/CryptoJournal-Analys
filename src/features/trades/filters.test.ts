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
