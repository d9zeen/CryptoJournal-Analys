import { describe, expect, it } from 'vitest'
import { binanceSpotFills, bingxSpotFills, bitgetSpotFills, bybitSpotFills, fetchSpotFills, hlSpotPairs, hyperliquidSpotFills, okxSpotFills, splitPair } from './fills'

const DAY = 86_400_000

describe('пары', () => {
  it('BTCUSDT / BTC-USDT / ETH_BTC → монета и котировка', () => {
    expect(splitPair('BTCUSDT')).toEqual({ asset: 'BTC', quote: 'USDT' })
    expect(splitPair('BTC-USDT')).toEqual({ asset: 'BTC', quote: 'USDT' })
    expect(splitPair('SOLFDUSD')).toEqual({ asset: 'SOL', quote: 'FDUSD' })
    expect(splitPair('eth_btc')).toEqual({ asset: 'ETH', quote: 'BTC' })
    expect(splitPair('???')).toBeNull()
  })
})

describe('Bybit: спотовые исполнения', () => {
  it('окна по 7 дней, страницы по курсору; комиссия покупки — в монете', async () => {
    const asked: Record<string, string | number>[] = []
    const call = async (_path: string, params: Record<string, string | number>) => {
      asked.push(params)
      if (params.cursor === 'p2') return { retCode: 0, retMsg: 'OK', result: { list: [{ symbol: 'BTCUSDT', side: 'Sell', execQty: '0.05', execPrice: '70000', execFee: '3.5', execId: 'e2', execTime: '1790000000000' }], nextPageCursor: '' } }
      if (asked.length === 1)
        return { retCode: 0, retMsg: 'OK', result: { list: [{ symbol: 'BTCUSDT', side: 'Buy', execQty: '0.1', execPrice: '60000', execFee: '0.0001', execId: 'e1', execTime: '1789000000000' }], nextPageCursor: 'p2' } }
      return { retCode: 0, retMsg: 'OK', result: { list: [], nextPageCursor: '' } }
    }
    const fills = await bybitSpotFills(call, 0, 10 * DAY)
    expect(asked[0]).toMatchObject({ category: 'spot', startTime: 0, limit: 100 })
    expect(asked.filter((p) => !p.cursor)).toHaveLength(2) // 10 дней → два окна
    expect(fills).toEqual([
      { external_id: 'bb:e1', asset: 'BTC', quote: 'USDT', side: 'buy', qty: 0.1, price: 60000, fee: 0.0001, fee_asset: 'BTC', at: new Date(1789000000000).toISOString() },
      { external_id: 'bb:e2', asset: 'BTC', quote: 'USDT', side: 'sell', qty: 0.05, price: 70000, fee: 3.5, fee_asset: 'USDT', at: new Date(1790000000000).toISOString() },
    ])
  })
  it('ошибка ключа — наверх (как у сделок)', async () => {
    await expect(bybitSpotFills(async () => ({ retCode: 10003, retMsg: 'invalid key' }), 0, DAY)).rejects.toMatchObject({ code: 10003 })
  })
})

describe('Binance: myTrades по парам монет с баланса', () => {
  it('первый раз — вся история по номерам; нет пары — пропуск; стейблкоины не перебираем', async () => {
    const asked: string[] = []
    const call = async (_path: string, params: Record<string, string | number>) => {
      asked.push(`${params.symbol}:${params.fromId ?? '-'}`)
      if (params.symbol !== 'BTCUSDT') return { code: -1121, msg: 'Invalid symbol.' }
      return [{ id: 7, qty: '0.01', price: '65000', commission: '0.00001', commissionAsset: 'BTC', time: 1789000000000, isBuyer: true }]
    }
    const fills = await binanceSpotFills(call, ['BTC', 'USDT'], null)
    expect(asked.sort()).toEqual(['BTCFDUSD:0', 'BTCUSDC:0', 'BTCUSDT:0'])
    expect(fills).toEqual([{ external_id: 'bn:BTCUSDT:7', asset: 'BTC', quote: 'USDT', side: 'buy', qty: 0.01, price: 65000, fee: 0.00001, fee_asset: 'BTC', at: new Date(1789000000000).toISOString() }])
  })
  it('повторно — последние сделки пары, только новее прошлого раза', async () => {
    const call = async (_path: string, params: Record<string, string | number>) =>
      params.symbol === 'ETHUSDT' ? [{ id: 1, qty: '1', price: '3000', commission: '0', commissionAsset: 'USDT', time: 1000, isBuyer: true }, { id: 2, qty: '1', price: '3100', commission: '0', commissionAsset: 'USDT', time: 5000, isBuyer: false }] : []
    const fills = await binanceSpotFills(call, ['ETH'], 2000)
    expect(fills.map((f) => f.external_id)).toEqual(['bn:ETHUSDT:2'])
  })
})

describe('OKX: fills-history SPOT', () => {
  it('страницы по billId до начала периода; комиссия OKX отрицательная — берём по модулю', async () => {
    const pages = [
      [{ instId: 'BTC-USDT', side: 'buy', fillSz: '0.1', fillPx: '60000', fee: '-0.0001', feeCcy: 'BTC', ts: '1789000000000', tradeId: 't1', billId: 'b1' }],
    ]
    const call = async () => ({ code: '0', msg: '', data: pages.shift() ?? [] })
    const fills = await okxSpotFills(call, 1788000000000)
    expect(fills).toEqual([{ external_id: 'ok:t1:b1', asset: 'BTC', quote: 'USDT', side: 'buy', qty: 0.1, price: 60000, fee: 0.0001, fee_asset: 'BTC', at: new Date(1789000000000).toISOString() }])
  })
})

describe('Bitget: единый аккаунт и классический', () => {
  it('единый (UTA): category=SPOT, окна по 30 дней, комиссия из feeDetail[]', async () => {
    const asked: [string, Record<string, string | number>][] = []
    const call = async (path: string, params: Record<string, string | number>) => {
      asked.push([path, params])
      const list = params.startTime === 0 && !params.cursor
        ? [{ execId: 'x1', symbol: 'BTCUSDT', side: 'buy', execPrice: '60000', execQty: '0.1', feeDetail: [{ feeCoin: 'BTC', fee: '-0.0001' }], createdTime: '1789000000000' }]
        : []
      return { code: '00000', data: { list, cursor: '' } }
    }
    const fills = await bitgetSpotFills(call, 0, 40 * DAY)
    expect(asked.every(([p, q]) => p === '/api/v3/trade/fills' && q.category === 'SPOT')).toBe(true)
    expect(asked.filter(([, q]) => !q.cursor).length).toBe(3) // проверка + два окна
    expect(fills).toEqual([{ external_id: 'bg:x1', asset: 'BTC', quote: 'USDT', side: 'buy', qty: 0.1, price: 60000, fee: 0.0001, fee_asset: 'BTC', at: new Date(1789000000000).toISOString() }])
  })
  it('классический: v2 spot fills, страницы назад по tradeId', async () => {
    const page = (from: number) => Array.from({ length: 100 }, (_, i) => ({ tradeId: String(from - i), symbol: 'ETHUSDT', side: 'sell', priceAvg: '3000', size: '1', feeDetail: { feeCoin: 'USDT', totalFee: '-3' }, cTime: '1789000000000' }))
    const asked: Record<string, string | number>[] = []
    const call = async (path: string, params: Record<string, string | number>) => {
      if (path === '/api/v3/trade/fills') return { code: '40084', msg: 'not unified account' }
      asked.push(params)
      return { code: '00000', data: params.idLessThan ? [{ tradeId: '1', symbol: 'ETHUSDT', side: 'buy', priceAvg: '2500', size: '2', feeDetail: { feeCoin: 'ETH', totalFee: '-0.002' }, cTime: '1788000000000' }] : page(500) }
    }
    const fills = await bitgetSpotFills(call, 0, DAY)
    expect(asked.map((p) => p.idLessThan ?? '')).toEqual(['', '401'])
    expect(fills).toHaveLength(101)
    expect(fills[100]).toMatchObject({ external_id: 'bg:1', asset: 'ETH', side: 'buy', qty: 2, price: 2500, fee: 0.002, fee_asset: 'ETH' })
    expect(fills[0]).toMatchObject({ side: 'sell', fee: 3, fee_asset: 'USDT' })
  })
})

describe('BingX: myTrades по парам с баланса', () => {
  it('пары BTC-USDT / BTC-USDC, нет пары — пропуск, комиссия по модулю', async () => {
    const asked: string[] = []
    const call = async (_path: string, params: Record<string, string | number>) => {
      asked.push(String(params.symbol))
      if (params.symbol !== 'BTC-USDT') return { code: 100204, msg: 'symbol not exist' }
      return { code: 0, data: { fills: [{ symbol: 'BTC-USDT', id: 36767057, price: '46820.155', qty: '0.1430254', commission: -0.000046483255, commissionAsset: 'BTC', time: 1704961925000, isBuyer: true }] } }
    }
    const fills = await bingxSpotFills(call, ['BTC', 'USDT'], 0, 7 * DAY)
    expect(asked.sort()).toEqual(['BTC-USDC', 'BTC-USDT'])
    expect(fills).toEqual([{ external_id: 'bx:BTC-USDT:36767057', asset: 'BTC', quote: 'USDT', side: 'buy', qty: 0.1430254, price: 46820.155, fee: 0.000046483255, fee_asset: 'BTC', at: new Date(1704961925000).toISOString() }])
  })
  it('история — только 7 дней назад', async () => {
    const asked: Record<string, string | number>[] = []
    const call = async (_p: string, params: Record<string, string | number>) => (asked.push(params), { code: 0, data: { fills: [] } })
    await fetchSpotFills({ exchange: 'bingx' }, call, { cursor: null, assets: ['SOL'], now: 100 * DAY })
    expect(asked.every((p) => p.startTime === 93 * DAY && p.endTime === 100 * DAY)).toBe(true)
  })
})

describe('Hyperliquid: спот по адресу', () => {
  const meta = {
    universe: [{ name: 'PURR/USDC', tokens: [1, 0], index: 0 }, { name: '@107', tokens: [150, 0], index: 107 }, { name: '@142', tokens: [197, 0], index: 142 }],
    tokens: [{ name: 'USDC', index: 0 }, { name: 'PURR', index: 1 }, { name: 'HYPE', index: 150 }, { name: 'UBTC', index: 197 }],
  }
  it('«@107» → HYPE / USDC, обёртка UBTC → BTC', () => {
    const p = hlSpotPairs(meta)
    expect(p.get('@107')).toEqual({ asset: 'HYPE', quote: 'USDC' })
    expect(p.get('PURR/USDC')).toEqual({ asset: 'PURR', quote: 'USDC' })
    expect(p.get('@142')).toEqual({ asset: 'BTC', quote: 'USDC' })
  })
  it('только спот (перпы — в сделках), комиссия в монете покупки', async () => {
    const bodies: { type: string }[] = []
    const fetchFn = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { type: string }
      bodies.push(body)
      const fills = [
        { coin: '@107', px: '30', sz: '10', side: 'B', time: 1789000000000, dir: 'Buy', fee: '0.007', feeToken: 'HYPE', oid: 1, tid: 11 },
        { coin: '@142', px: '100000', sz: '0.01', side: 'A', time: 1789000001000, dir: 'Sell', fee: '0.5', feeToken: 'USDC', oid: 2, tid: 12 },
        { coin: 'BTC', px: '100000', sz: '0.1', side: 'B', time: 1789000002000, dir: 'Open Long', fee: '1', feeToken: 'USDC', oid: 3, tid: 13 },
      ]
      return new Response(JSON.stringify(body.type === 'spotMeta' ? meta : fills))
    }) as unknown as typeof fetch
    const fills = await hyperliquidSpotFills('0xabc', 0, fetchFn)
    expect(bodies.map((b) => b.type)).toEqual(['spotMeta', 'userFillsByTime'])
    expect(fills).toEqual([
      { external_id: 'hl:11', asset: 'HYPE', quote: 'USDC', side: 'buy', qty: 10, price: 30, fee: 0.007, fee_asset: 'HYPE', at: new Date(1789000000000).toISOString() },
      { external_id: 'hl:12', asset: 'BTC', quote: 'USDC', side: 'sell', qty: 0.01, price: 100000, fee: 0.5, fee_asset: 'USDC', at: new Date(1789000001000).toISOString() },
    ])
  })
})

describe('откуда продолжать', () => {
  it('биржи без истории спота — null; курсор — сейчас', async () => {
    expect(await fetchSpotFills({ exchange: 'polymarket' }, async () => null, { cursor: null, assets: [] })).toBeNull()
    const r = await fetchSpotFills({ exchange: 'okx' }, async () => ({ code: '0', data: [] }), { cursor: null, assets: [], now: 123 * DAY })
    expect(r).toEqual({ fills: [], cursor: new Date(123 * DAY).toISOString() })
  })
})
