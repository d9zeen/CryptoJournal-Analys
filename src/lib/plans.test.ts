import { describe, expect, it } from 'vitest'
import { canConnect, planFor, planInfo } from './plans'

describe('тарифы', () => {
  it('лимиты сделок: Basic 30, Pro 50, Pro Plus без лимита', () => {
    expect([planInfo('free').tradeLimit, planInfo('pro').tradeLimit, planInfo('pro_plus').tradeLimit]).toEqual([30, 50, null])
  })
  it('подключения: Polymarket с Pro, биржи — только Pro Plus', () => {
    expect(canConnect('polymarket', 'free')).toBe(false)
    expect(canConnect('polymarket', 'pro')).toBe(true)
    expect(canConnect('bybit', 'pro')).toBe(false)
    expect(canConnect('hyperliquid', 'pro_plus')).toBe(true)
    expect(planFor('bybit')).toBe('pro_plus')
  })
  it('синхронизация на сервере — только Pro Plus', () => {
    expect(planInfo('pro').serverSync).toBe(false)
    expect(planInfo('pro_plus').serverSync).toBe(true)
  })
})
