/**
 * Проверка на сотнях случайных сценариев (детерминированный генератор — падения воспроизводимы).
 * Законы, которые обязаны выполняться при любых исполнениях:
 *  1. сумма PnL собранных сделок = денежный поток по всем исполнениям (без комиссий), если все позиции закрыты;
 *  2. цены входа/выхода каждой сделки — в пределах цен исполнений;
 *  3. незакрытая к концу файла позиция даёт ровно одну пометку «не закрыта»;
 *  4. повторный разбор того же файла даёт те же id сделок.
 */
import { describe, expect, it } from 'vitest'
import { parserFor } from './registry'
import { prepareImport } from './plan'

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

type F = { sym: string; side: 'BUY' | 'SELL'; price: number; qty: number; t: number }

/** Случайная история: позиция ходит вверх-вниз (с разворотами) и в конце (по желанию) закрывается в ноль */
function genFills(r: () => number, symbols: string[], close: boolean): F[] {
  const out: F[] = []
  let t = Date.UTC(2026, 9, 1)
  for (const sym of symbols) {
    let pos = 0
    let price = 10 + r() * 1000
    const steps = 2 + Math.floor(r() * 12)
    for (let i = 0; i < steps; i++) {
      price = Math.max(0.01, price * (1 + (r() - 0.5) * 0.1))
      const qty = Math.round((0.1 + r() * 5) * 1000) / 1000
      const side = r() < 0.5 ? 'BUY' : 'SELL'
      out.push({ sym, side, price: Math.round(price * 100) / 100, qty, t: (t += 60_000 + Math.floor(r() * 3_600_000)) })
      pos += side === 'BUY' ? qty : -qty
    }
    if (close && Math.abs(pos) > 1e-12) {
      out.push({ sym, side: pos > 0 ? 'SELL' : 'BUY', price: Math.round(price * 100) / 100, qty: Math.abs(Math.round(pos * 1000) / 1000), t: (t += 60_000) })
    }
  }
  return out
}

const toCsv = (fills: F[]) =>
  ['Time,Symbol,Side,Price,Qty', ...fills.map((f) => `${new Date(f.t).toISOString().slice(0, 19).replace('T', ' ')},${f.sym},${f.side},${f.price},${f.qty}`)].join('\n')

const parse = (csv: string) => prepareImport(csv, parserFor('other')!)

describe('история исполнений: законы на случайных данных', () => {
  it('сумма PnL = денежный поток; цены в пределах; id стабильны (300 сценариев)', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed)
      const fills = genFills(r, ['AAAUSDT', 'BBBUSDT', 'CCCUSDT'].slice(0, 1 + Math.floor(r() * 3)), true)
      const csv = toCsv(fills)
      const prep = parse(csv)
      const trades = prep.rows.filter((x) => x.trade).map((x) => x.trade!)
      const errors = prep.rows.filter((x) => x.error)
      expect(errors, `seed ${seed}`).toEqual([])

      const cash = fills.reduce((s, f) => s + (f.side === 'SELL' ? 1 : -1) * f.qty * f.price, 0)
      const pnl = trades.reduce((s, t) => s + t.pnl, 0)
      expect(pnl, `seed ${seed}`).toBeCloseTo(cash, 4)

      for (const t of trades) {
        const prices = fills.filter((f) => f.sym === t.symbol).map((f) => f.price)
        const lo = Math.min(...prices) - 1e-9
        const hi = Math.max(...prices) + 1e-9
        expect(t.entry_price, `seed ${seed}`).toBeGreaterThanOrEqual(lo)
        expect(t.entry_price, `seed ${seed}`).toBeLessThanOrEqual(hi)
        expect(t.exit_price, `seed ${seed}`).toBeGreaterThanOrEqual(lo)
        expect(t.exit_price, `seed ${seed}`).toBeLessThanOrEqual(hi)
        expect(t.size_usd).toBeGreaterThan(0)
        expect(t.exit_at >= t.entry_at).toBe(true)
      }
      const ids = trades.map((t) => t.external_id)
      expect(new Set(ids).size).toBe(ids.length)
      expect(parse(csv).rows.filter((x) => x.trade).map((x) => x.trade!.external_id)).toEqual(ids)
    }
  })

  it('незакрытая позиция — ровно одна пометка на пару (200 сценариев)', () => {
    for (let seed = 1000; seed < 1200; seed++) {
      const r = rng(seed)
      const fills = genFills(r, ['AAAUSDT'], false)
      const pos = fills.reduce((s, f) => s + (f.side === 'BUY' ? f.qty : -f.qty), 0)
      const open = parse(toCsv(fills)).rows.filter((x) => x.error === 'stillOpen').length
      expect(open, `seed ${seed}`).toBe(Math.abs(pos) > 1e-9 ? 1 : 0)
    }
  })

  it('порядок строк в файле не важен (новые сверху / снизу)', () => {
    const fills = genFills(rng(7), ['AAAUSDT', 'BBBUSDT'], true)
    const a = parse(toCsv(fills)).rows.filter((x) => x.trade).map((x) => x.trade!.pnl).sort()
    const b = parse(toCsv([...fills].reverse())).rows.filter((x) => x.trade).map((x) => x.trade!.pnl).sort()
    expect(b).toEqual(a)
  })
})
