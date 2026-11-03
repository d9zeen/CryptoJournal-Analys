import type { TradeWithTags } from '@/types/db'
import type { Side } from '@/lib/calc/trade'

export type TradeFilters = {
  exchange: string
  side: '' | Side
  status: '' | 'open' | 'closed'
  setupId: string
  tagId: string
  symbol: string
}

export const EMPTY_FILTERS: TradeFilters = { exchange: '', side: '', status: '', setupId: '', tagId: '', symbol: '' }

export function applyFilters(trades: TradeWithTags[], f: TradeFilters): TradeWithTags[] {
  const sym = f.symbol.trim().toUpperCase()
  return trades.filter(
    (tr) =>
      (!f.exchange || tr.exchange === f.exchange) &&
      (!f.side || tr.side === f.side) &&
      (!f.status || (f.status === 'open' ? tr.exit_at === null : tr.exit_at !== null)) &&
      (!f.setupId || tr.setup_id === f.setupId) &&
      (!f.tagId || tr.trade_mistakes.some((m) => m.tag_id === f.tagId)) &&
      (!sym || tr.symbol.includes(sym)),
  )
}

export function hasActiveFilters(f: TradeFilters): boolean {
  return Object.values(f).some(Boolean)
}
