import { describe, expect, it } from 'vitest'
import { binanceSpotFills, bybitSpotFills, fetchSpotFills, okxSpotFills, splitPair } from './fills'

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

describe('откуда продолжать', () => {
  it('биржи без истории спота — null; курсор — сейчас', async () => {
    expect(await fetchSpotFills({ exchange: 'bingx' }, async () => null, { cursor: null, assets: [] })).toBeNull()
    const r = await fetchSpotFills({ exchange: 'okx' }, async () => ({ code: '0', data: [] }), { cursor: null, assets: [], now: 123 * DAY })
    expect(r).toEqual({ fills: [], cursor: new Date(123 * DAY).toISOString() })
  })
})
