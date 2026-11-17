import { describe, expect, it } from 'vitest'
import { INTERVAL_MS, MAX_CANDLES, autoInterval, candleSources, candleWindow, fetchCandles, loadTradeCandles, okxInstId } from './candles'

const M = 60_000
const H = 60 * M
const T0 = Date.UTC(2026, 10, 1, 10, 0)

describe('таймфрейм и окно графика', () => {
  it('сделка на 20 минут — минутки, на 4 часа — 5 минут, на 3 дня — час, на 2 месяца — дни', () => {
    expect(autoInterval(T0, T0 + 20 * M)).toBe('1m')
    expect(autoInterval(T0, T0 + 4 * H)).toBe('5m')
    expect(autoInterval(T0, T0 + 72 * H)).toBe('1h')
    expect(autoInterval(T0, T0 + 60 * 24 * H)).toBe('1d')
  })

  it('окно: сделка внутри, запас с обеих сторон, не больше MAX_CANDLES свечей, ровно по свечам', () => {
    for (const dur of [0, 5 * M, 4 * H, 72 * H, 40 * 24 * H]) {
      const iv = autoInterval(T0, T0 + dur)
      const ms = INTERVAL_MS[iv]
      const w = candleWindow(T0, T0 + dur, iv, T0 + 400 * 24 * H)
      expect(w.from).toBeLessThan(T0)
      expect(w.to).toBeGreaterThan(T0 + dur)
      expect((w.to - w.from) / ms).toBeLessThanOrEqual(MAX_CANDLES)
      expect(w.from % ms).toBe(0)
    }
  })

  it('окно не заходит в будущее', () => {
    const now = T0 + 10 * M
    expect(candleWindow(T0, T0 + 5 * M, '1m', now).to).toBe(now)
  })

  it('ручной мелкий таймфрейм у длинной сделки — конец сделки и всё, что влезает', () => {
    const w = candleWindow(T0, T0 + 30 * 24 * H, '1m', T0 + 400 * 24 * H)
    expect((w.to - w.from) / M).toBe(MAX_CANDLES)
    expect(w.to).toBeGreaterThan(T0 + 30 * 24 * H)
  })
})

describe('откуда свечи', () => {
  it('своя биржа первой, остальные — запасные', () => {
    expect(candleSources('bybit', 'BTCUSDT', 'linear').map((s) => s.source)).toEqual(['bybit', 'binance', 'okx'])
    expect(candleSources('okx', 'ETHUSDT', 'linear').map((s) => s.source)).toEqual(['okx', 'binance', 'bybit'])
    expect(candleSources('bingx', 'SOL-USDT', 'linear')).toEqual([
      { source: 'binance', symbol: 'SOLUSDT' },
      { source: 'bybit', symbol: 'SOLUSDT' },
      { source: 'okx', symbol: 'SOLUSDT' },
    ])
  })
  it('Hyperliquid: монета без USDC; биржа-строитель — «xyz:TSLA»; Polymarket — без графика', () => {
    expect(candleSources('hyperliquid', 'HYPEUSDC', 'linear')[0]).toEqual({ source: 'hyperliquid', symbol: 'HYPE' })
    expect(candleSources('hyperliquid', 'HYPEUSDC', 'linear')[1]).toEqual({ source: 'binance', symbol: 'HYPEUSDT' })
    expect(candleSources('hyperliquid', 'XYZ-TSLAUSDC', 'linear')).toEqual([{ source: 'hyperliquid', symbol: 'xyz:TSLA' }])
    expect(candleSources('polymarket', 'X', 'prediction')).toEqual([])
  })
  it('инверсные — без Binance; мусорный код пары — никуда', () => {
    expect(candleSources('bybit', 'BTCUSD', 'inverse').map((s) => s.source)).toEqual(['bybit', 'okx'])
    expect(candleSources('manual', 'BTC USDT?', 'linear')).toEqual([])
  })
  it('OKX: код инструмента', () => {
    expect(okxInstId('BTCUSDT', 'linear')).toBe('BTC-USDT-SWAP')
    expect(okxInstId('ETHUSDC', 'spot')).toBe('ETH-USDC')
    expect(okxInstId('BTCUSD', 'inverse')).toBe('BTC-USD-SWAP')
  })
})

/** Фейковый fetch: адрес → ответ; запоминает, куда ходили */
function fakeFetch(handler: (url: string, init?: RequestInit) => unknown) {
  const calls: string[] = []
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push(String(url))
    const body = handler(String(url), init)
    if (body instanceof Response) return body
    return new Response(JSON.stringify(body), { status: 200 })
  }) as typeof fetch
  return { fn, calls }
}
const rows = (from: number, n: number, ms: number) => Array.from({ length: n }, (_, i) => [from + i * ms, 100 + i, 101 + i, 99 + i, 100.5 + i])

describe('разбор ответов бирж', () => {
  it('Bybit: от новых к старым → по порядку; строки — числа', async () => {
    const list = rows(T0, 5, M).reverse().map((r) => r.map(String))
    const { fn, calls } = fakeFetch(() => ({ retCode: 0, result: { list } }))
    const c = await fetchCandles('bybit', 'BTCUSDT', 'linear', '1m', T0, T0 + 5 * M, fn)
    expect(c.map((x) => x.t)).toEqual([0, 1, 2, 3, 4].map((i) => T0 + i * M))
    expect(c[0]).toEqual({ t: T0, o: 100, h: 101, l: 99, c: 100.5 })
    expect(calls[0]).toContain('category=linear')
    expect(calls[0]).toContain('interval=1&')
  })

  it('Binance: спот и фьючерсы — разные адреса', async () => {
    const { fn, calls } = fakeFetch(() => rows(T0, 3, H))
    await fetchCandles('binance', 'BTCUSDT', 'spot', '1h', T0, T0 + 3 * H, fn)
    await fetchCandles('binance', 'BTCUSDT', 'linear', '1h', T0, T0 + 3 * H, fn)
    expect(calls[0]).toMatch(/^https:\/\/api\.binance\.com\/api\/v3\/klines/)
    expect(calls[1]).toMatch(/^https:\/\/fapi\.binance\.com\/fapi\/v1\/klines/)
  })

  it('OKX: страницы по 100 назад от конца окна', async () => {
    const all = rows(T0, 250, M)
    const { fn, calls } = fakeFetch((url) => {
      const after = Number(new URL(url).searchParams.get('after'))
      const page = all.filter((r) => r[0] < after).reverse().slice(0, 100)
      return { code: '0', data: page.map((r) => r.map(String)) }
    })
    const c = await fetchCandles('okx', 'BTCUSDT', 'linear', '1m', T0, T0 + 250 * M, fn)
    expect(c.length).toBe(250)
    expect(c[0].t).toBe(T0)
    expect(calls.length).toBe(3)
    expect(calls[0]).toContain('instId=BTC-USDT-SWAP')
  })

  it('Hyperliquid: POST candleSnapshot', async () => {
    const { fn } = fakeFetch((_url, init) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({ type: 'candleSnapshot', req: { coin: 'HYPE', interval: '5m' } })
      return rows(T0, 4, 5 * M).map(([t, o, h, l, c]) => ({ t, o: String(o), h: String(h), l: String(l), c: String(c) }))
    })
    const c = await fetchCandles('hyperliquid', 'HYPE', 'linear', '5m', T0, T0 + 20 * M, fn)
    expect(c.length).toBe(4)
  })

  it('мусор в ответе отбрасывается', async () => {
    const { fn } = fakeFetch(() => [[T0, 'x', 1, 1, 1], [T0 + M, 1, 0.5, 2, 1], [T0 + 2 * M, 1, 2, 0.5, 1.5]])
    const c = await fetchCandles('binance', 'BTCUSDT', 'linear', '1m', T0, T0 + 3 * M, fn)
    expect(c.map((x) => x.t)).toEqual([T0 + 2 * M])
  })
})

describe('свечи для сделки', () => {
  const trade = { exchange: 'bitget', symbol: 'BTCUSDT', market_type: 'linear' as const, entry_at: new Date(T0).toISOString(), exit_at: new Date(T0 + 30 * M).toISOString() }

  it('первая биржа не ответила — берём следующую', async () => {
    const { fn, calls } = fakeFetch((url) => {
      if (url.includes('binance')) return new Response('nope', { status: 451 })
      const q = new URL(url).searchParams
      const from = Number(q.get('start'))
      const to = Number(q.get('end'))
      return { retCode: 0, result: { list: rows(from, (to - from) / M, M).reverse() } }
    })
    const r = await loadTradeCandles(trade, '1m', T0 + 400 * H, fn)
    expect(r?.source).toBe('bybit')
    expect(calls[0]).toContain('binance')
  })

  it('свечи не застали сделку (монета появилась позже) — следующая биржа; ни у кого нет — null', async () => {
    const { fn } = fakeFetch((url) => {
      if (url.includes('binance')) return rows(T0 + 20 * M, 30, M)
      if (url.includes('bybit')) return { retCode: 10001, result: { list: [] } }
      return { code: '51001', data: [] }
    })
    expect(await loadTradeCandles(trade, '1m', T0 + 400 * H, fn)).toBeNull()
  })
})
