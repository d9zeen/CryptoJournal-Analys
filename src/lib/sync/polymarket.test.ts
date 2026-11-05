import { describe, expect, it } from 'vitest'
import { fetchPmClosed, pmPositionToTrade, type PmGet } from './polymarket'
import { grossPnl } from '@/lib/calc/trade'

const camel = { conditionId: '0xabcdef0123456789', title: 'Will BTC hit 150k in 2026?', outcome: 'Yes', avgPrice: 0.4, totalBought: 100, realizedPnl: 60, timestamp: 1793000000 }

describe('pmPositionToTrade', () => {
  it('выигрыш: выход = вход + PnL / доли, размер = доли × цена', () => {
    const t = pmPositionToTrade(camel)!
    expect(t).toMatchObject({ exchange: 'polymarket', market_type: 'prediction', side: 'long', symbol: 'PM-ABCDEF01-YES', entry_price: 0.4, exit_price: 1, size_usd: 40, pnl: 60, leverage: 1, external_id: 'pm:0xabcdef0123456789:Yes' })
    expect(t.title).toBe('Will BTC hit 150k in 2026? — Yes')
    expect(t.exit_at).toBe(new Date(1793000000 * 1000).toISOString())
    // формула дневника даёт тот же PnL
    expect(grossPnl({ marketType: 'prediction', side: 'long', entryPrice: t.entry_price, exitPrice: t.exit_price, sizeUsd: t.size_usd })).toBeCloseTo(60)
  })

  it('проигрыш: исход погашен по 0', () => {
    const t = pmPositionToTrade({ ...camel, outcome: 'No', realizedPnl: -40 })!
    expect(t.exit_price).toBe(0)
    expect(grossPnl({ marketType: 'prediction', side: 'long', entryPrice: t.entry_price, exitPrice: 0, sizeUsd: t.size_usd })).toBeCloseTo(-40)
  })

  it('поля в snake_case (v2) и дата окончания вместо времени', () => {
    const t = pmPositionToTrade({ condition_id: '0x11112222333344445555', title: 'Election', outcome: 'Trump', avg_price: '0.55', total_bought: '200', realized_pnl: '-20', end_date: '2026-11-04' })!
    expect(t).toMatchObject({ symbol: 'PM-11112222-TRUMP', entry_price: 0.55, exit_price: 0.45, size_usd: 110, pnl: -20, exit_at: '2026-11-04T00:00:00.000Z' })
  })

  it('неполная запись — пропуск', () => {
    expect(pmPositionToTrade({ ...camel, avgPrice: 0 })).toBeNull()
    expect(pmPositionToTrade({ ...camel, timestamp: undefined })).toBeNull()
  })
})

describe('fetchPmClosed', () => {
  it('курсор pagination.next_cursor, фильтры повторяются на каждой странице', async () => {
    const calls: Record<string, string | number>[] = []
    const get: PmGet = async (_p, params) => {
      calls.push(params)
      return params.cursor ? { data: [camel], pagination: { next_cursor: null } } : { data: [camel, camel], pagination: { next_cursor: 'abc' } }
    }
    const all = await fetchPmClosed(get, '0xuser')
    expect(all).toHaveLength(3)
    expect(calls).toEqual([
      { user: '0xuser', status: 'CLOSED', limit: 50 },
      { user: '0xuser', status: 'CLOSED', limit: 50, cursor: 'abc' },
    ])
  })
  it('ответ-массив (без курсора) — одна страница', async () => {
    const all = await fetchPmClosed(async () => [camel], '0xuser')
    expect(all).toHaveLength(1)
  })
})
