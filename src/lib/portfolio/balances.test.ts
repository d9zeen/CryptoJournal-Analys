import { describe, expect, it } from 'vitest'
import {
  binanceBalances,
  bingxBalances,
  bitgetBalances,
  bybitBalances,
  cleanSymbol,
  hyperliquidBalances,
  mergeBalances,
  okxBalances,
  polymarketBalances,
} from './balances'

/** Фейковая биржа: адрес → ответ (нет адреса — ошибка «нет прав», как у дополнительного счёта) */
const fake = (answers: Record<string, unknown>) => async (path: string) => {
  if (!(path in answers)) return { code: -2015, retCode: 10005, msg: 'no permission', retMsg: 'no permission' }
  return answers[path]
}

describe('общие правила', () => {
  it('символы: заглавными, обёртки Hyperliquid — те же монеты, мусор — прочь', () => {
    expect(cleanSymbol('btc')).toBe('BTC')
    expect(cleanSymbol('UBTC')).toBe('BTC')
    expect(cleanSymbol('<b>x</b>')).toBeNull()
    expect(cleanSymbol(5)).toBeNull()
  })
  it('одинаковые монеты одного счёта складываются, нули и заём отбрасываются', () => {
    expect(
      mergeBalances([
        { account: 'spot', symbol: 'btc', amount: 0.1 },
        { account: 'spot', symbol: 'BTC', amount: 0.2 },
        { account: 'fund', symbol: 'BTC', amount: 1 },
        { account: 'spot', symbol: 'USDT', amount: -50 },
        { account: 'spot', symbol: 'ETH', amount: 0 },
      ]),
    ).toEqual([
      { account: 'spot', symbol: 'BTC', amount: 0.30000000000000004 },
      { account: 'fund', symbol: 'BTC', amount: 1 },
    ])
  })
})

describe('Bybit', () => {
  it('только спот: единый счёт без стейблкоинов (маржа фьючерсов), монеты без PnL фьючерсов + фандинг + Earn', async () => {
    const call = fake({
      '/v5/account/wallet-balance': {
        retCode: 0,
        result: { list: [{ coin: [{ coin: 'USDT', equity: '1200.5', walletBalance: '1000' }, { coin: 'USDC', walletBalance: '50' }, { coin: 'BTC', equity: '0.25', walletBalance: '0.25' }] }] },
      },
      '/v5/asset/transfer/query-account-coins-balance': { retCode: 0, result: { balance: [{ coin: 'USDT', walletBalance: '300' }, { coin: 'DOGE', walletBalance: '0' }] } },
      '/v5/earn/position': { retCode: 0, result: { list: [{ coin: 'ETH', amount: '1.5' }] } },
    })
    const b = await bybitBalances(call)
    // USDT / USDC единого счёта — деньги под фьючерсы, в спотовый портфель не идут; USDT на фандинге — идут
    expect(b.filter((x) => x.account === 'spot').map((x) => x.symbol)).toEqual(['BTC'])
    expect(b).toContainEqual({ account: 'spot', symbol: 'BTC', amount: 0.25 })
    expect(b).toContainEqual({ account: 'fund', symbol: 'USDT', amount: 300 })
    // Earn: FlexibleSaving и OnChain — один и тот же фейковый ответ дважды → 3 ETH
    expect(b).toContainEqual({ account: 'earn', symbol: 'ETH', amount: 3 })
    expect(b.find((x) => x.symbol === 'DOGE')).toBeUndefined()
  })
  it('основной счёт не ответил — ошибка ключа, а не пустой портфель', async () => {
    await expect(bybitBalances(fake({}))).rejects.toMatchObject({ code: 10005 })
  })
})

describe('Binance', () => {
  it('спот без LD-активов (это Earn) + фандинг + Earn; фьючерсный счёт не спрашиваем', async () => {
    const call = fake({
      '/api/v3/account': { balances: [{ asset: 'BTC', free: '0.1', locked: '0.05' }, { asset: 'LDUSDT', free: '500', locked: '0' }] },
      '/sapi/v1/asset/get-funding-asset': [{ asset: 'USDT', free: '100', locked: '0', freeze: '10', withdrawing: '0' }],
      '/fapi/v2/balance': [{ asset: 'USDT', balance: '1000', crossUnPnl: '-25' }],
      '/sapi/v1/simple-earn/flexible/position': { rows: [{ asset: 'USDT', totalAmount: '500' }] },
      '/sapi/v1/simple-earn/locked/position': { rows: [] },
    })
    const b = await binanceBalances(call)
    expect(b).toEqual([
      { account: 'spot', symbol: 'BTC', amount: 0.15000000000000002 },
      { account: 'fund', symbol: 'USDT', amount: 110 },
      { account: 'earn', symbol: 'USDT', amount: 500 },
    ])
    // USDT на споте Binance — настоящий спот (фьючерсы — отдельный счёт), он считается
    expect(await binanceBalances(fake({ '/api/v3/account': { balances: [{ asset: 'USDT', free: '25', locked: '0' }] } }))).toEqual([{ account: 'spot', symbol: 'USDT', amount: 25 }])
  })
  it('фьючерсы не включены — портфель без них, а не ошибка', async () => {
    const b = await binanceBalances(fake({ '/api/v3/account': { balances: [{ asset: 'ETH', free: '2', locked: '0' }] } }))
    expect(b).toEqual([{ account: 'spot', symbol: 'ETH', amount: 2 }])
  })
})

describe('OKX', () => {
  it('торговый счёт (единый): монеты по cashBal, без стейблкоинов + фандинг + Earn', async () => {
    const ok = (data: unknown) => ({ code: '0', msg: '', data })
    const b = await okxBalances(
      fake({
        '/api/v5/account/balance': ok([{ details: [{ ccy: 'BTC', eq: '0.52', cashBal: '0.5' }, { ccy: 'USDT', eq: '12.3', cashBal: '12' }] }]),
        '/api/v5/asset/balances': ok([{ ccy: 'USDT', bal: '7.7' }]),
        '/api/v5/finance/savings/balance': ok([{ ccy: 'USDC', amt: '100' }]),
      }),
    )
    expect(b).toEqual([
      { account: 'spot', symbol: 'BTC', amount: 0.5 },
      { account: 'fund', symbol: 'USDT', amount: 7.7 },
      { account: 'earn', symbol: 'USDC', amount: 100 },
    ])
  })
})

describe('Bitget', () => {
  it('единый аккаунт: монеты по balance, стейблкоины (маржа фьючерсов) — нет', async () => {
    const b = await bitgetBalances(
      fake({
        '/api/v3/account/assets': {
          code: '00000',
          data: { accountEquity: '11.1', assets: [{ coin: 'USDT', equity: '6.19', balance: '6' }, { coin: 'BGB', equity: '3.1', balance: '3' }] },
        },
      }),
    )
    expect(b).toEqual([{ account: 'spot', symbol: 'BGB', amount: 3 }])
  })
  it('классический: только спотовый счёт, фьючерсные не спрашиваем', async () => {
    const b = await bitgetBalances(
      fake({
        '/api/v3/account/assets': { code: '40084', msg: 'not uta' },
        '/api/v2/spot/account/assets': { code: '00000', data: [{ coin: 'BGB', available: '10', frozen: '1', locked: '0' }] },
        '/api/v2/mix/account/accounts': { code: '00000', data: [{ marginCoin: 'USDT', accountEquity: '250' }] },
      }),
    )
    expect(b).toEqual([{ account: 'spot', symbol: 'BGB', amount: 11 }])
  })
})

describe('BingX', () => {
  it('только спот: фьючерсный счёт не спрашиваем', async () => {
    const b = await bingxBalances(
      fake({
        '/openApi/spot/v1/account/balance': { code: 0, data: { balances: [{ asset: 'USDT', free: '40', locked: '2' }] } },
        '/openApi/swap/v2/user/balance': { code: 0, data: { balance: { asset: 'USDT', balance: '100', equity: '96.5' } } },
      }),
    )
    expect(b).toEqual([{ account: 'spot', symbol: 'USDT', amount: 42 }])
  })
})

describe('Hyperliquid', () => {
  it('только спот по монетам: счёт перпов не считаем', async () => {
    const fetchFn = (async (_url: string, init?: RequestInit) => {
      const type = JSON.parse(String(init?.body)).type
      const body =
        type === 'spotClearinghouseState'
          ? { balances: [{ coin: 'HYPE', total: '120', hold: '0' }, { coin: 'UBTC', total: '0.01' }, { coin: 'USDC', total: '5' }] }
          : { marginSummary: { accountValue: '1500.25' } }
      return new Response(JSON.stringify(body), { status: 200 })
    }) as typeof fetch
    expect(await hyperliquidBalances('0xabc', fetchFn)).toEqual([
      { account: 'spot', symbol: 'HYPE', amount: 120 },
      { account: 'spot', symbol: 'BTC', amount: 0.01 },
      { account: 'spot', symbol: 'USDC', amount: 5 },
    ])
  })
})

describe('Polymarket', () => {
  it('открытые позиции — одной строкой со стоимостью в $', async () => {
    const pages = [
      { data: [{ current_value: 40.5 }, { total_size: 100, cur_price: 0.3 }], pagination: { next_cursor: 'p2' } },
      { data: [{ currentValue: 9.5 }], pagination: { next_cursor: '' } },
    ]
    const asked: unknown[] = []
    const get = async (_path: string, params: Record<string, string | number>) => {
      asked.push(params)
      return pages[asked.length - 1]
    }
    expect(await polymarketBalances(get, '0xabc')).toEqual([{ account: 'prediction', symbol: 'POLYMARKET', amount: 80, value_usd: 80 }])
    expect(asked[0]).toMatchObject({ status: 'OPEN' })
  })
})
