import { describe, expect, it } from 'vitest'
import { DEMO_PORTFOLIO, DEMO_PORTFOLIO_USD, buildDemoPortfolio, demoSnapshots } from './portfolio'
import type { Coin } from '@/lib/calc/portfolio'

const coin = (symbol: string, price: number | null, rank = 10): Coin => ({ id: symbol.toLowerCase(), symbol, name: symbol, rank, price, change_24h: 1, change_7d: 2, spark: null, icon: null })
const PRICES: Record<string, number> = { BTC: 95000, ETH: 3200, SOL: 145, HYPE: 28, BNB: 900, XRP: 2.2, LINK: 14, SUI: 1.7, DOGE: 0.17, TON: 2.4, USDT: 1 }
const COINS = Object.entries(PRICES).map(([s, p], i) => coin(s, p, i + 1))

describe('демо-портфель гостя', () => {
  it('известные монеты по нынешним ценам — в сумме около 12 500 $, количество — 4 значащие цифры', () => {
    const { holdings } = buildDemoPortfolio(COINS)
    expect(holdings.map((h) => h.symbol)).toEqual(DEMO_PORTFOLIO.map((x) => x.symbol))
    expect(holdings.every((h) => h.account === 'manual' && h.amount > 0)).toBe(true)
    const total = holdings.reduce((s, h) => s + h.amount * PRICES[h.symbol], 0)
    expect(Math.abs(total - DEMO_PORTFOLIO_USD) / DEMO_PORTFOLIO_USD).toBeLessThan(0.01)
    const btc = holdings.find((h) => h.symbol === 'BTC')!.amount
    expect(String(btc).replace('0.', '').replace(/^0+/, '').length).toBeLessThanOrEqual(4)
  })

  it('цены входа: часть монет в плюсе, часть в минусе; у стейблкоина цены входа нет (и так 1 $)', () => {
    const { costs } = buildDemoPortfolio(COINS)
    const up = costs.filter((c) => c.avg_price < PRICES[c.symbol]).length
    const down = costs.filter((c) => c.avg_price > PRICES[c.symbol]).length
    expect(up).toBeGreaterThan(0)
    expect(down).toBeGreaterThan(0)
    expect(costs.some((c) => c.symbol === 'USDT')).toBe(false)
  })

  it('монеты без цены пропускаются, сумма всё равно около 12 500 $; у одноимённых — цена монеты с большей капитализацией', () => {
    const coins = [...COINS.filter((c) => c.symbol !== 'TON' && c.symbol !== 'HYPE'), coin('HYPE', null), coin('SOL', 0.001, 900)]
    const { holdings } = buildDemoPortfolio(coins)
    expect(holdings.some((h) => h.symbol === 'TON' || h.symbol === 'HYPE')).toBe(false)
    const total = holdings.reduce((s, h) => s + h.amount * PRICES[h.symbol], 0)
    expect(Math.abs(total - DEMO_PORTFOLIO_USD) / DEMO_PORTFOLIO_USD).toBeLessThan(0.01)
  })

  it('история: полгода точками раз в 6 часов, кончается оценкой 7 дней без скачка; одинаковая при каждом открытии', () => {
    const now = Date.UTC(2026, 10, 20)
    const estimate = Array.from({ length: 42 }, (_, k) => ({ t: now - 7 * 864e5 + (k * 7 * 864e5) / 41, value: 12000 + k * 10, btcPrice: 95000 }))
    const a = demoSnapshots(estimate, now, 12480, 95000)
    const b = demoSnapshots(estimate, now, 12480, 95000)
    expect(a).toEqual(b)
    expect(Date.parse(a[0].at)).toBeLessThanOrEqual(now - 179 * 864e5)
    expect(a.slice(-42).map((s) => s.total_usd)).toEqual(estimate.map((e) => e.value))
    const joint = a.length - 42
    expect(Math.abs(a[joint - 1].total_usd / a[joint].total_usd - 1)).toBeLessThan(0.05)
    expect(a.every((s) => s.total_usd > 0 && s.btc_price !== null && s.btc_price > 0)).toBe(true)
    for (let i = 1; i < a.length; i++) expect(Date.parse(a[i].at)).toBeGreaterThan(Date.parse(a[i - 1].at))
  })

  it('без оценки (нет мини-графиков) — история кончается нынешней стоимостью; пустой портфель — без истории', () => {
    const now = Date.UTC(2026, 10, 20)
    const a = demoSnapshots([], now, 12480, null)
    expect(a.length).toBeGreaterThan(600)
    expect(a.every((s) => s.btc_price === null)).toBe(true)
    expect(demoSnapshots([], now, 0, null)).toEqual([])
  })
})
