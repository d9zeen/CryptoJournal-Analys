/**
 * Bybit UTA Perp Trade History: «Direction» — только Long / Short (сторона позиции), открытие / закрытие не указано.
 * Модель файла: тысячи исполнений, доливки, частичные закрытия, новые сверху — с колонкой Closed P&L и без неё.
 */
import { describe, expect, it } from 'vitest'
import { prepareImport } from './plan'
import { parserFor } from './registry'

type Truth = { entry: number; exit: number; side: 'long' | 'short' }

function makeFile(withPnl: boolean) {
  const header = ['Contracts', 'Direction', 'Filled Qty', 'Filled Price', 'Filled Value', 'Trading Fee', 'Order Type', 'Trade Type', ...(withPnl ? ['Closed P&L'] : []), 'Order No.', 'Transaction Time(UTC+0)']
  const rows: string[][] = []
  const truth: Truth[] = []
  let t = Date.UTC(2026, 4, 1)
  let seed = 7
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const syms = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', '1000PEPEUSDT']
  const row = (sym: string, dir: string, q: number, p: number, pnl: number) => {
    t += 60_000
    const m: Record<string, string> = {
      Contracts: sym, Direction: dir, 'Filled Qty': String(q), 'Filled Price': p.toFixed(6), 'Filled Value': (q * p).toFixed(6),
      'Trading Fee': (q * p * 0.00055).toFixed(8), 'Order Type': 'Market', 'Trade Type': 'Trade', 'Closed P&L': pnl.toFixed(4),
      'Order No.': `o${t}`, 'Transaction Time(UTC+0)': new Date(t).toISOString().replace('T', ' ').slice(0, 19),
    }
    rows.push(header.map((h) => m[h]))
  }
  while (rows.length < 6000) {
    const sym = syms[Math.floor(rnd() * syms.length)]
    const dir = rnd() < 0.5 ? 'Long' : 'Short'
    let price = 100 + rnd() * 50
    let pos = 0
    let cost = 0
    let got = 0
    const opens = 1 + Math.floor(rnd() * 3)
    for (let i = 0; i < opens; i++) {
      const q = Math.round((1 + rnd() * 5) * 100) / 100
      price *= 1 + (rnd() - 0.5) * 0.01
      row(sym, dir, q, price, 0)
      pos = Math.round((pos + q) * 100) / 100
      cost += q * price
    }
    const entry = cost / pos
    let left = pos
    const parts = 1 + Math.floor(rnd() * 2)
    for (let i = 0; i < parts; i++) {
      const q = i === parts - 1 ? left : Math.round((left / 2) * 100) / 100
      left = Math.round((left - q) * 100) / 100
      price *= 1 + (rnd() - 0.5) * 0.02
      row(sym, dir, q, price, (rnd() - 0.4) * 10 || 1)
      got += q * price
    }
    truth.push({ entry, exit: got / pos, side: dir === 'Long' ? 'long' : 'short' })
  }
  rows.reverse() // как у Bybit: новые сверху
  return { csv: [header.join(','), ...rows.map((r) => r.join(','))].join('\n'), truth }
}

describe('Bybit UTA Trade History (модель файла на 6000 строк)', () => {
  for (const withPnl of [true, false]) {
    it(withPnl ? 'с колонкой Closed P&L — открытие / закрытие по PnL' : 'без PnL — закрытия находятся по возврату позиции в ноль', () => {
      const { csv, truth } = makeFile(withPnl)
      const p = prepareImport(csv, parserFor('bybit')!)
      expect(p.sideFallback).toBe('positionSide')
      const trades = p.rows.filter((r) => r.trade).map((r) => r.trade!)
      expect(p.rows.filter((r) => r.error)).toEqual([])
      expect(trades).toHaveLength(truth.length)
      // цены входа и выхода совпадают с настоящими сделками (порядок — по времени закрытия)
      const sorted = [...trades].sort((a, b) => a.exit_at.localeCompare(b.exit_at))
      const wrong = sorted.filter((tr, i) => tr.side !== truth[i].side || Math.abs(tr.entry_price - truth[i].entry) > 1e-4 || Math.abs(tr.exit_price - truth[i].exit) > 1e-4).length
      expect(wrong).toBe(0)
    })
  }
})
