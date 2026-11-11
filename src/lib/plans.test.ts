import { describe, expect, it } from 'vitest'
import { activeConnections, canConnect, connectBlock, monthlyPrice, planFor, planInfo, planTerm, yearDiscount } from './plans'

describe('тарифы', () => {
  it('лимиты сделок: Basic 50, Pro и Pro Plus без лимита', () => {
    expect([planInfo('free').tradeLimit, planInfo('pro').tradeLimit, planInfo('pro_plus').tradeLimit]).toEqual([50, null, null])
  })
  it('подключения 0 / 1 / 5, скриншоты 2 / 10 / 10', () => {
    expect(['free', 'pro', 'pro_plus'].map((p) => planInfo(p as 'free').connections)).toEqual([0, 1, 5])
    expect(['free', 'pro', 'pro_plus'].map((p) => planInfo(p as 'free').screenshots)).toEqual([2, 10, 10])
  })
  it('цены: месяц и год, за год −20 % ($8 и $12 в месяц)', () => {
    expect([planInfo('pro').price, planInfo('pro').priceYear, planInfo('pro_plus').price, planInfo('pro_plus').priceYear]).toEqual([10, 96, 15, 144])
    expect(monthlyPrice(planInfo('pro'), 'year')).toBe(8)
    expect(monthlyPrice(planInfo('pro_plus'), 'year')).toBe(12)
    expect(monthlyPrice(planInfo('pro_plus'), 'month')).toBe(15)
    expect(monthlyPrice(planInfo('free'), 'year')).toBe(0)
    expect([yearDiscount(planInfo('pro')), yearDiscount(planInfo('pro_plus')), yearDiscount(planInfo('free'))]).toEqual([20, 20, 0])
  })
  it('Polymarket — только Pro Plus; биржи и кошельки — с Pro', () => {
    expect(canConnect('polymarket', 'pro')).toBe(false)
    expect(canConnect('polymarket', 'pro_plus')).toBe(true)
    expect(canConnect('bybit', 'pro')).toBe(true)
    expect(canConnect('hyperliquid', 'free')).toBe(false)
    expect(planFor('polymarket')).toBe('pro_plus')
    expect(planFor('bybit')).toBe('pro')
  })
  it('canConnect учитывает число уже подключённых', () => {
    expect(canConnect('bybit', 'pro', 0)).toBe(true)
    expect(canConnect('hyperliquid', 'pro', 1)).toBe(false)
    expect(canConnect('polymarket', 'pro_plus', 4)).toBe(true)
    expect(canConnect('polymarket', 'pro_plus', 5)).toBe(false)
    expect(canConnect('bybit', 'pro_plus', 9, true)).toBe(true) // админ — без лимита
    expect(connectBlock('polymarket', 'pro', 0)).toBe('type')
    expect(connectBlock('bybit', 'pro', 1)).toBe('limit')
    expect(connectBlock('bybit', 'free', 0)).toBe('type')
    expect(connectBlock('bybit', 'pro_plus', 2)).toBeNull()
  })
  it('на паузе: Polymarket на Pro и всё сверх лимита (по дате подключения)', () => {
    const conns = [
      { id: 'pm', exchange: 'polymarket', created_at: '2026-11-01' },
      { id: 'hl', exchange: 'hyperliquid', created_at: '2026-11-02' },
      { id: 'by', exchange: 'bybit', created_at: '2026-11-03' },
    ]
    expect([...activeConnections(conns, 'pro')]).toEqual(['hl'])
    expect(activeConnections(conns, 'pro_plus').size).toBe(3)
    expect(activeConnections(conns, 'free').size).toBe(0)
    expect(activeConnections(conns, 'free', true).size).toBe(3)
  })
  it('синхронизация на сервере — только Pro Plus', () => {
    expect(planInfo('pro').serverSync).toBe(false)
    expect(planInfo('pro_plus').serverSync).toBe(true)
  })
  it('срок тарифа: пробный — плашка за 2 дня, обычный — за 3', () => {
    const now = Date.UTC(2026, 10, 11, 12)
    const day = 86_400_000
    const trial = (d: number) => planTerm({ plan: 'pro_plus', plan_until: new Date(now + d * day).toISOString(), plan_trial: true }, 'pro_plus', now)
    expect(trial(6.5)).toMatchObject({ kind: 'trial', daysLeft: 7, soon: false })
    expect(trial(2)).toMatchObject({ daysLeft: 2, soon: true })
    const paid = (d: number) => planTerm({ plan: 'pro', plan_until: new Date(now + d * day).toISOString(), plan_trial: false }, 'pro', now)
    expect(paid(4)).toMatchObject({ kind: 'paid', soon: false })
    expect(paid(3)).toMatchObject({ kind: 'paid', soon: true })
    expect(planTerm({ plan: 'pro', plan_until: null }, 'pro', now)).toBeNull() // бессрочно
    expect(planTerm({ plan: 'pro', plan_until: new Date(now - day).toISOString() }, 'free', now)).toBeNull() // истёк
    expect(planTerm({ plan: 'free', plan_until: new Date(now + day).toISOString() }, 'pro_plus', now)).toBeNull() // админ
  })
})
