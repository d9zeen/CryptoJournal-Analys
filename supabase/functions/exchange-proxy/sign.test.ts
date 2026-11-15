import { describe, expect, it } from 'vitest'
import { createHmac } from 'node:crypto'
import { BYBIT_READ_PATHS, READ_PATHS, buildQuery, bybitSignature, callExchange, hostsFor, parseSecret, pickParams, signRequest, type Cred } from './sign'

const cred: Cred = { apiKey: 'KEY12345678', secret: 'SECRET1234567890', passphrase: 'Phrase#1' }
const NOW = 1730000000000
const hex = (payload: string) => createHmac('sha256', cred.secret).update(payload).digest('hex')
const b64 = (payload: string) => createHmac('sha256', cred.secret).update(payload).digest('base64')

describe('прокси бирж: подпись Bybit', () => {
  it('HMAC-SHA256 в hex — как у Bybit', async () => {
    const payload = '1672211928338' + 'XXXXXXXXXX' + '5000' + 'category=linear&limit=100'
    const expected = createHmac('sha256', 'YYYYYYYYYY').update(payload).digest('hex')
    expect(await bybitSignature('YYYYYYYYYY', payload)).toBe(expected)
  })
  it('в запрос попадают только разрешённые параметры', () => {
    expect(buildQuery({ category: 'linear', startTime: 1, endTime: 2, limit: 100, cursor: 'a b', evil: 'x', symbol: '' })).toBe(
      'category=linear&startTime=1&endTime=2&limit=100&cursor=a%20b',
    )
    expect(buildQuery({ category: { x: 1 } })).toBe('')
  })
  it('только адреса для чтения', () => {
    expect(BYBIT_READ_PATHS.has('/v5/position/closed-pnl')).toBe(true)
    expect(BYBIT_READ_PATHS.has('/v5/order/create')).toBe(false)
  })
  it('заголовки Bybit', async () => {
    const r = await signRequest('bybit', cred, '/v5/user/query-api', {}, undefined, NOW)
    expect(r.url).toBe('https://api.bybit.com/v5/user/query-api')
    expect(r.headers['X-BAPI-SIGN']).toBe(hex(`${NOW}${cred.apiKey}10000`))
  })
})

describe('прокси бирж: только чтение у всех', () => {
  it('торговля, вывод и переводы закрыты', () => {
    const forbidden = ['/v5/order/create', '/openApi/swap/v2/trade/order', '/api/v5/trade/order', '/api/v5/asset/withdrawal', '/api/v2/mix/order/place-order', '/fapi/v1/order', '/sapi/v1/capital/withdraw/apply']
    for (const set of Object.values(READ_PATHS)) for (const p of forbidden) expect(set.has(p)).toBe(false)
  })
  it('чужой адрес не подписываем', async () => {
    await expect(signRequest('okx', cred, '/api/v5/trade/order', {})).rejects.toThrow('NOT_ALLOWED')
    await expect(signRequest('binance', cred, '/fapi/v1/order', { symbol: 'BTCUSDT' })).rejects.toThrow('NOT_ALLOWED')
  })
  it('лишние и опасные параметры отбрасываются (в адрес не подставить &, = и пробелы)', () => {
    expect(pickParams('binance', { symbol: 'BTCUSDT', side: 'BUY', quantity: 1, startTime: 5, x: 'y' })).toEqual([['symbol', 'BTCUSDT'], ['startTime', '5']])
    expect(pickParams('okx', { instType: 'SWAP&ordType=market', limit: 100 })).toEqual([['limit', '100']])
    expect(pickParams('bingx', { symbol: 'BTC-USDT', startTime: 1, endTime: { a: 1 } }, true)).toEqual([['startTime', '1'], ['symbol', 'BTC-USDT']])
  })
})

describe('прокси бирж: подписи по документации бирж', () => {
  it('BingX: параметры по алфавиту + timestamp, hex, ключ в X-BX-APIKEY', async () => {
    const r = await signRequest('bingx', cred, '/openApi/swap/v2/user/income', { startTime: 1, symbol: 'BTC-USDT', incomeType: 'REALIZED_PNL' }, undefined, NOW)
    const q = `incomeType=REALIZED_PNL&startTime=1&symbol=BTC-USDT&timestamp=${NOW}`
    expect(r.url).toBe(`https://open-api.bingx.com/openApi/swap/v2/user/income?${q}&signature=${hex(q)}`)
    expect(r.headers).toEqual({ 'X-BX-APIKEY': cred.apiKey })
  })
  it('Binance: recvWindow + timestamp, hex; права ключа — на api.binance.com', async () => {
    const r = await signRequest('binance', cred, '/fapi/v1/userTrades', { symbol: 'BTCUSDT', startTime: 1, endTime: 2, limit: 1000 }, undefined, NOW)
    const q = `symbol=BTCUSDT&startTime=1&endTime=2&limit=1000&recvWindow=10000&timestamp=${NOW}`
    expect(r.url).toBe(`https://fapi.binance.com/fapi/v1/userTrades?${q}&signature=${hex(q)}`)
    expect(r.headers).toEqual({ 'X-MBX-APIKEY': cred.apiKey })
    expect(hostsFor('binance', '/sapi/v1/account/apiRestrictions')).toEqual(['https://api.binance.com'])
  })
  it('OKX: base64(время ISO + GET + путь с параметрами), кодовая фраза в заголовке', async () => {
    const r = await signRequest('okx', cred, '/api/v5/account/positions-history', { instType: 'SWAP', limit: 100 }, undefined, NOW)
    const iso = new Date(NOW).toISOString()
    const path = '/api/v5/account/positions-history?instType=SWAP&limit=100'
    expect(r.url).toBe(`https://www.okx.com${path}`)
    expect(r.headers).toEqual({ 'OK-ACCESS-KEY': cred.apiKey, 'OK-ACCESS-SIGN': b64(iso + 'GET' + path), 'OK-ACCESS-TIMESTAMP': iso, 'OK-ACCESS-PASSPHRASE': 'Phrase#1' })
  })
  it('Bitget: base64(время мс + GET + путь?параметры)', async () => {
    const r = await signRequest('bitget', cred, '/api/v3/position/history-position', { limit: 100, category: 'USDT-FUTURES' }, undefined, NOW)
    const path = '/api/v3/position/history-position?category=USDT-FUTURES&limit=100'
    expect(r.url).toBe(`https://api.bitget.com${path}`)
    expect(r.headers['ACCESS-SIGN']).toBe(b64(`${NOW}GET${path}`))
    expect(r.headers['ACCESS-PASSPHRASE']).toBe('Phrase#1')
  })
})

describe('прокси бирж: секрет и регион OKX', () => {
  it('секрет с кодовой фразой хранится одной строкой JSON', () => {
    expect(parseSecret('{"s":"abc","p":"phrase"}')).toEqual({ secret: 'abc', passphrase: 'phrase' })
    expect(parseSecret('PlainSecret123')).toEqual({ secret: 'PlainSecret123', passphrase: null })
    expect(parseSecret('{broken')).toEqual({ secret: '{broken', passphrase: null })
  })
  it('OKX: «ключа нет» (50119) — пробуем Европу, потом запоминаем регион', async () => {
    const hosts: string[] = []
    const fetchFn = (async (url: string) => {
      hosts.push(new URL(url).host)
      const body = url.includes('eea.okx.com') ? { code: '0', data: [{ perm: 'read_only' }] } : { code: '50119', msg: "API key doesn't exist" }
      return new Response(JSON.stringify(body), { status: url.includes('eea') ? 200 : 401 })
    }) as typeof fetch
    const c = { ...cred, apiKey: 'okx-eu-key-1' }
    const r = await callExchange('okx', c, '/api/v5/account/config', {}, fetchFn)
    expect(r.json).toEqual({ code: '0', data: [{ perm: 'read_only' }] })
    expect(hosts).toEqual(['www.okx.com', 'eea.okx.com'])
    await callExchange('okx', c, '/api/v5/account/config', {}, fetchFn)
    expect(hosts.slice(2)).toEqual(['eea.okx.com'])
  })
})
