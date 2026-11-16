import { describe, expect, it } from 'vitest'
import { allocation, coinsBySymbol, costBasis, estimateHistory, movers, portfolioRows, portfolioSeries, portfolioTotals, realizedTotal, thinOut, type Coin, type Holding } from './portfolio'

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
  it('за длинный период — последняя точка в окне (без «пилы» из часовых снимков)', () => {
    const H = 3_600_000
    const pts = Array.from({ length: 48 }, (_, i) => ({ t: i * H, v: i }))
    expect(thinOut(pts, 6 * H).map((p) => p.v)).toEqual([5, 11, 17, 23, 29, 35, 41, 47])
    expect(thinOut(pts, 0)).toHaveLength(48)
    const now = 90 * 86_400_000
    const snaps = Array.from({ length: 24 * 30 }, (_, i) => ({ at: new Date(now - (24 * 30 - i) * H).toISOString(), total_usd: 1000 + (i % 2) * 50, btc_price: 100000 }))
    expect(portfolioSeries(snaps, '3m', now).length).toBeLessThanOrEqual(31)
    expect(portfolioSeries(snaps, '24h', now).length).toBe(24)
  })
})

describe('портфель: оценка до первого снимка', () => {
  const now = Date.parse('2026-11-16T12:00:00Z')
  const withSpark = (c: Coin, spark: number[]): Coin => ({ ...c, spark })
  const cs = [withSpark(coin('BTC', 100000, 1), [80000, 90000, 100000]), coin('USDT', 1, 3), coin('ETH', 3000, 2)]
  const rows = portfolioRows([h('BTC', 0.5), h('USDT', 1000, null), h('POLYMARKET', 80, 'c3', 80)], cs, {})
  it('нынешние монеты × цены недели; без недельной цены — по нынешней стоимости', () => {
    const e = estimateHistory(rows, cs, now, 3)
    expect(e.map((p) => p.value)).toEqual([0.5 * 80000 + 1000 + 80, 0.5 * 90000 + 1000 + 80])
    expect(e[0].t).toBe(now - 7 * 864e5)
    expect(e[1].btcPrice).toBe(90000)
  })
  it('ни у одной монеты нет недельной цены — оценки нет', () => {
    expect(estimateHistory(portfolioRows([h('ETH', 1)], cs, {}), cs, now)).toEqual([])
  })
  it('на графике — пунктиром до первого снимка, стык общий; при истории снимков оценки нет', () => {
    const e = estimateHistory(rows, cs, now, 3)
    const snaps = [{ at: new Date(now - 3_600_000 * 2).toISOString(), total_usd: 51000, btc_price: 100000 }]
    const s = portfolioSeries(snaps, '7d', now, { value: 51080, btcPrice: 100000 }, e)
    expect(s.map((p) => [p.value, p.est])).toEqual([[null, 41080], [null, 46080], [51000, 51000], [51080, null]])
    const old = [{ at: new Date(now - 8 * 864e5).toISOString(), total_usd: 40000, btc_price: 90000 }, ...snaps]
    expect(portfolioSeries(old, 'all', now, undefined, e).every((p) => p.est === null)).toBe(true)
  })
})

describe('портфель: средняя цена из истории покупок', () => {
  const f = (side: 'buy' | 'sell', qty: number, price: number, at: string, fee = 0, fee_asset: string | null = null, asset = 'BTC', quote = 'USDT') => ({ asset, quote, side, qty, price, fee, fee_asset, at })
  it('средневзвешенная: 0,1 по 60 000 + 0,1 по 80 000 → 70 000', () => {
    const b = costBasis([f('buy', 0.1, 60000, '2026-01-01'), f('buy', 0.1, 80000, '2026-02-01')])
    expect(b.BTC.qty).toBeCloseTo(0.2, 12)
    expect(b.BTC.avg).toBeCloseTo(70000, 6)
    expect(b.BTC.realized).toBe(0)
  })
  it('продажа фиксирует прибыль, средняя не меняется; порядок — по времени', () => {
    const b = costBasis([f('sell', 0.1, 90000, '2026-03-01'), f('buy', 0.2, 70000, '2026-01-01')])
    expect(b.BTC.qty).toBeCloseTo(0.1, 12)
    expect(b.BTC.avg).toBeCloseTo(70000, 6)
    expect(b.BTC.realized).toBeCloseTo(2000, 6)
  })
  it('комиссии: в монете — меньше монет, в котировке — дороже покупка и меньше выручка', () => {
    const b = costBasis([f('buy', 1, 100, '2026-01-01', 0.01, 'BTC'), f('sell', 0.5, 120, '2026-02-01', 0.6, 'USDT')])
    // куплено 0,99 за 100 $ → средняя 101,0101…; продано 0,5 по 120 минус 0,6 $
    expect(b.BTC.avg).toBeCloseTo(100 / 0.99, 6)
    expect(b.BTC.realized).toBeCloseTo(0.5 * 120 - 0.6 - 0.5 * (100 / 0.99), 6)
  })
  it('продали больше купленного (монеты пришли переводом) — лишнее не считаем; всё продано — средняя заново', () => {
    const b = costBasis([f('buy', 1, 100, '2026-01-01'), f('sell', 3, 150, '2026-02-01'), f('buy', 1, 200, '2026-03-01')])
    expect(b.BTC.realized).toBeCloseTo((150 - 100) * 1, 6)
    expect(b.BTC.avg).toBeCloseTo(200, 6)
  })
  it('котировка не в долларах (ETHBTC) — в цену входа не идёт', () => {
    expect(costBasis([f('buy', 1, 0.05, '2026-01-01', 0, null, 'ETH', 'BTC')])).toEqual({})
  })
  it('в портфеле: руками важнее истории, история важнее «стейблкоин = 1 $»; сколько куплено на биржах', () => {
    const basis = costBasis([f('buy', 0.25, 80000, '2026-01-01'), f('buy', 2, 2500, '2026-01-02', 0, null, 'ETH'), f('sell', 1, 3000, '2026-02-01', 0, null, 'ETH')])
    const rows = portfolioRows([h('BTC', 0.5), h('ETH', 1)], coins, { ETH: 2000 }, null, basis)
    expect(rows.find((r) => r.symbol === 'BTC')).toMatchObject({ avgPrice: 80000, avgSource: 'trades', covered: 0.5, invested: 40000 })
    expect(rows.find((r) => r.symbol === 'ETH')).toMatchObject({ avgPrice: 2000, avgSource: 'manual', realized: 500 })
    expect(realizedTotal(basis)).toBeCloseTo(500, 6)
  })
})
