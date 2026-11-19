import { describe, expect, it } from 'vitest'
import { demoAccount } from '@/features/landing/demo'
import { buildDemoRows, priceAt, roundPrice } from './seed'
import type { Candle } from '@/lib/candles'

const H = 3_600_000
const lists = {
  setups: [{ id: 's1', name: 'Пробой уровня' }, { id: 's2', name: 'Ретест' }],
  mistakes: [{ id: 'm1', name: 'Поздний вход' }, { id: 'm2', name: 'Без стопа' }, { id: 'm3', name: 'Двинул стоп' }],
  emotions: [{ id: 'e1', name: 'Спокоен' }, { id: 'e2', name: 'Страх' }],
}
const ids = () => {
  let n = 0
  return () => `id-${n++}`
}
/** Свечи «рынка» по часам: цена плавно ходит вокруг base */
function market(from: number, to: number, base: number): Candle[] {
  const out: Candle[] = []
  for (let t = Math.floor(from / H) * H; t <= to; t += H) {
    const p = (x: number) => base * (1 + Math.sin(x / 7) * 0.03 + Math.sin(x / 2.3) * 0.01)
    out.push({ t, o: p(t / H), h: 0, l: 0, c: p(t / H + 1) })
  }
  return out
}

describe('демо-счёт гостя', () => {
  const demo = demoAccount(Date.UTC(2026, 10, 19))

  it('цена внутри часа — между открытием и закрытием; вне свечей — null', () => {
    const c = [{ t: 0, o: 100, h: 0, l: 0, c: 110 }]
    expect(priceAt(c, 0)).toBe(100)
    expect(priceAt(c, H / 2)).toBe(105)
    expect(priceAt(c, H)).toBeNull()
    expect(priceAt([], 0)).toBeNull()
    expect(roundPrice(92345.678)).toBe(92345.68)
    expect(roundPrice(0.163456789)).toBe(0.163457)
  })

  it('без свечей: 60 сделок с тем же PnL, что в превью, цены правдоподобные', () => {
    const { trades, mistakes } = buildDemoRows(demo.trades, lists, {}, ids())
    expect(trades).toHaveLength(60)
    expect(trades.map((x) => x.pnl)).toEqual(demo.trades.map((x) => x.pnl))
    const total = trades.reduce((s, x) => s + x.pnl, 0)
    expect(Math.round(total * 100) / 100).toBe(demo.summary.totalPnl)
    for (const t of trades) {
      expect(t.entry_price).toBeGreaterThan(0)
      expect(t.exit_price).toBeGreaterThan(0)
      expect(t.size_usd).toBeGreaterThanOrEqual(500)
      // PnL позиции по ценам — тот же, что записан (с точностью до округления цен)
      const dir = t.side === 'long' ? 1 : -1
      expect(Math.abs(t.size_usd * dir * (t.exit_price / t.entry_price - 1) - t.pnl)).toBeLessThan(0.5)
      expect(t.external_id).toMatch(/^demo:\d+$/)
    }
    // «Без стопа» — без стопа и без R; у остальных стоп с нужной стороны
    const nostop = trades.filter((t) => mistakes.some((m) => m.trade_id === t.id && m.tag_id === 'm2'))
    expect(nostop.length).toBeGreaterThan(0)
    expect(nostop.every((t) => t.stop_loss === null && t.r_multiple === null)).toBe(true)
    for (const t of trades.filter((x) => x.stop_loss !== null)) {
      expect(t.side === 'long' ? t.stop_loss! < t.entry_price : t.stop_loss! > t.entry_price).toBe(true)
    }
    // ошибки — только у убыточных, сетапы и эмоции — из списков пользователя
    expect(mistakes.every((m) => trades.find((t) => t.id === m.trade_id)!.pnl < 0)).toBe(true)
    expect(trades.every((t) => t.setup_id === 's1' || t.setup_id === 's2' || t.setup_id === null)).toBe(true)
  })

  it('со свечами: вход и выход — на цене рынка, направление — по движению рынка', () => {
    const from = Date.parse(demo.trades[0].entry_at) - 2 * H
    const to = Date.parse(demo.trades[59].exit_at) + 2 * H
    const candles = Object.fromEntries([...new Set(demo.trades.map((x) => x.symbol))].map((s) => [s, market(from, to, 100)]))
    const { trades } = buildDemoRows(demo.trades, lists, candles, ids())
    let onMarket = 0
    for (const t of trades) {
      const realIn = priceAt(candles[t.symbol], Date.parse(t.entry_at))!
      const realOut = priceAt(candles[t.symbol], Date.parse(t.exit_at))!
      expect(Math.abs(t.entry_price / realIn - 1)).toBeLessThan(1e-4)
      // выход на рынке, если размер позиции не упёрся в границы 500…60 000 $
      if (Math.abs(t.exit_price / realOut - 1) < 1e-4) onMarket++
      const dir = t.side === 'long' ? 1 : -1
      expect(Math.abs(t.size_usd * dir * (t.exit_price / t.entry_price - 1) - t.pnl)).toBeLessThan(0.5)
    }
    expect(onMarket).toBeGreaterThan(35)
  })
})
