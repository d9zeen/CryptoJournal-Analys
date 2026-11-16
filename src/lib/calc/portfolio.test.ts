import { describe, expect, it } from 'vitest'
import { allocation, coinsBySymbol, movers, portfolioRows, portfolioSeries, portfolioTotals, type Coin, type Holding } from './portfolio'

const coin = (symbol: string, price: number | null, rank: number, change_24h: number | null = null, id = symbol.toLowerCase()): Coin => ({
  id, symbol, name: symbol, rank, price, change_24h, change_7d: null, spark: null, icon: null,
})
const coins = [coin('BTC', 100000, 1, 2), coin('ETH', 3000, 2, -5), coin('USDT', 1, 3, 0), coin('BTC', 5, 900, 300, 'fake-btc'), coin('HYPE', 30, 20, 10)]
let n = 0
const h = (symbol: string, amount: number, connection_id: string | null = 'c1', value_usd: number | null = null): Holding => ({
  id: `h${++n}`, connection_id, account: connection_id ? 'spot' : 'manual', symbol, amount, value_usd, note: null, updated_at: '2026-11-16T10:00:00Z',
})

describe('портфель: строки', () => {
  const holdings = [h('BTC', 0.2), h('BTC', 0.3, 'c2'), h('ETH', 2), h('USDT', 1000, null), h('PEPE2', 1e9), h('POLYMARKET', 80, 'c3', 80)]
  const rows = portfolioRows(holdings, coins, { BTC: 80000 })

  it('цена — у настоящей монеты с этим символом, а не у мусорной', () => {
    expect(coinsBySymbol(coins).get('BTC')!.id).toBe('btc')
    const btc = rows.find((r) => r.symbol === 'BTC')!
    expect(btc).toMatchObject({ amount: 0.5, value: 50000, price: 100000, sources: ['c1', 'c2'] })
  })
  it('цена входа: указанная руками, стейблкоин — 1 $, иначе неизвестна', () => {
    expect(rows.find((r) => r.symbol === 'BTC')).toMatchObject({ avgPrice: 80000, avgManual: true, invested: 40000, pnl: 10000, pnlPct: 0.25 })
    expect(rows.find((r) => r.symbol === 'USDT')).toMatchObject({ avgPrice: 1, avgManual: false, invested: 1000, pnl: 0 })
    expect(rows.find((r) => r.symbol === 'ETH')).toMatchObject({ avgPrice: null, invested: null, pnl: null })
  })
  it('изменение за сутки в $: из стоимости сейчас и %', () => {
    const eth = rows.find((r) => r.symbol === 'ETH')!
    expect(eth.value).toBe(6000)
    expect(eth.change24Usd!).toBeCloseTo(6000 - 6000 / 0.95, 6)
  })
  it('Polymarket — по известной стоимости, без цены входа', () => {
    expect(rows.find((r) => r.symbol === 'POLYMARKET')).toMatchObject({ value: 80, price: null, avgPrice: null, invested: null })
  })
  it('монета без цены — в конце и не в сумме', () => {
    expect(rows[rows.length - 1]).toMatchObject({ symbol: 'PEPE2', value: null, share: 0 })
    const t = portfolioTotals(rows)
    expect(t.value).toBe(50000 + 6000 + 1000 + 80)
    expect(t.unpriced).toBe(1)
    expect(t.priced).toBe(4)
  })
  it('итоги: прибыль только по монетам с ценой входа', () => {
    const t = portfolioTotals(rows)
    expect(t.invested).toBe(41000)
    expect(t.pnl).toBe(10000)
    expect(t.withCost).toBe(2)
    expect(t.pnlPct).toBeCloseTo(10000 / 41000, 9)
  })
  it('доли в сумме — 100 %, сначала самые дорогие', () => {
    expect(rows.map((r) => r.symbol)).toEqual(['BTC', 'ETH', 'USDT', 'POLYMARKET', 'PEPE2'])
    expect(rows.reduce((a, r) => a + r.share, 0)).toBeCloseTo(1, 9)
  })
  it('фильтр по источнику: одно подключение или «вручную»', () => {
    expect(portfolioRows(holdings, coins, {}, 'c2').map((r) => [r.symbol, r.amount])).toEqual([['BTC', 0.3]])
    expect(portfolioRows(holdings, coins, {}, 'manual').map((r) => r.symbol)).toEqual(['USDT'])
  })
})

describe('портфель: доли, лучшие / худшие, график', () => {
  const rows = portfolioRows([h('BTC', 1), h('ETH', 1), h('USDT', 500), h('HYPE', 10)], coins, {})
  it('кольцо: топ + «Другое»', () => {
    const a = allocation(rows, 2)
    expect(a.map((x) => x.symbol)).toEqual(['BTC', 'ETH', null])
    expect(a[2].value).toBe(800)
  })
  it('лучшая и худшая за 24 ч, стейблкоины не в счёт', () => {
    const m = movers(rows)
    expect(m.best!.symbol).toBe('HYPE')
    expect(m.worst!.symbol).toBe('ETH')
  })
  it('график: период, «сейчас» в конце и линия «если бы всё было в BTC»', () => {
    const now = Date.parse('2026-11-16T12:00:00Z')
    const snaps = [
      { at: '2026-10-01T00:00:00Z', total_usd: 500, btc_price: 50000 },
      { at: '2026-11-10T00:00:00Z', total_usd: 1000, btc_price: 100000 },
      { at: '2026-11-15T00:00:00Z', total_usd: 1100, btc_price: 90000 },
    ]
    const s = portfolioSeries(snaps, '7d', now, { value: 1200, btcPrice: 95000 })
    expect(s.map((p) => p.value)).toEqual([1000, 1100, 1200])
    // 1000 $ в BTC по 100 000 = 0,01 BTC → 900 $ и 950 $
    expect(s.map((p) => p.btc)).toEqual([1000, 900, 950])
    expect(portfolioSeries(snaps, 'all', now).length).toBe(3)
    expect(portfolioSeries([], '7d', now)).toEqual([])
  })
})
