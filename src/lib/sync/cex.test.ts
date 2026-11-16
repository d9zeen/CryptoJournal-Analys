import { describe, expect, it } from 'vitest'
import { grossPnl } from '@/lib/calc/trade'
import type { ImportedTrade } from '@/lib/import/types'
import type { CexCall } from './cex'
import { checkOkxKey, fetchOkxTrades, okxPositionToTrade, type OkxPosition } from './okx'
import { bitgetPositionToTrade, checkBitgetKey, fetchBitgetTrades } from './bitget'
import { bingxPositionToTrade, checkBingxKey, fetchBingxTrades } from './bingx'
import { binanceFillsToTrades, checkBinanceKey, fetchBinanceTrades, type BinanceFill } from './binance'

/** PnL биржи сходится с формулой дневника: валовый − комиссии + фандинг */
const consistent = (t: ImportedTrade) => {
  const gross = grossPnl({ marketType: t.market_type, side: t.side, entryPrice: t.entry_price, exitPrice: t.exit_price, sizeUsd: t.size_usd })!
  expect(gross - t.fee + t.funding).toBeCloseTo(t.pnl, 6)
}

describe('OKX', () => {
  // пример из документации OKX (positions-history), BTC-USDT-SWAP: контракт = 0.01 BTC
  const p: OkxPosition = {
    instId: 'BTC-USDT-SWAP', posId: '452587086133239818', direction: 'long', type: '2', openAvgPx: '60000', closeAvgPx: '61000',
    closeTotalPos: '3', realizedPnl: '29.1', fee: '-0.72', fundingFee: '-0.18', lever: '10', cTime: '1730000000000', uTime: '1730100000000',
  }
  const inst = { instId: 'BTC-USDT-SWAP', ctVal: '0.01', ctType: 'linear' }

  it('позиция → сделка: размер из контрактов, PnL / комиссия / фандинг от биржи', () => {
    const t = okxPositionToTrade(p, inst)!
    expect(t).toMatchObject({ exchange: 'okx', symbol: 'BTCUSDT', market_type: 'linear', side: 'long', entry_price: 60000, exit_price: 61000, size_usd: 1800, leverage: 10, fee: 0.72, funding: -0.18, pnl: 29.1, external_id: 'okx:452587086133239818:1730000000000' })
    expect(t.entry_at).toBe(new Date(1730000000000).toISOString())
    consistent(t)
  })
  it('инверсный контракт: размер в долларах, PnL в монете → в доллары по цене выхода', () => {
    // 10 контрактов по 100 $: шорт 60000 → 59000
    const coinPnl = 1000 * (1 / 59000 - 1 / 60000) // валовый в BTC
    const t = okxPositionToTrade({ ...p, instId: 'BTC-USD-SWAP', direction: 'short', closeAvgPx: '59000', closeTotalPos: '10', realizedPnl: String(coinPnl), fee: '0', fundingFee: '0' }, { instId: 'BTC-USD-SWAP', ctVal: '100', ctType: 'inverse' })!
    expect(t).toMatchObject({ market_type: 'inverse', symbol: 'BTCUSD', size_usd: 1000, side: 'short' })
    consistent(t)
  })
  it('частичное закрытие и незнакомый инструмент — пропуск', () => {
    expect(okxPositionToTrade({ ...p, type: '1' }, inst)).toBeNull()
    expect(okxPositionToTrade(p, undefined)).toBeNull()
  })
  it('страницы от новых к старым, остановка на начале периода', async () => {
    const calls: Record<string, unknown>[] = []
    const call: CexCall = async (path, params) => {
      if (path === '/api/v5/public/instruments') return { code: '0', data: [inst] }
      calls.push(params)
      const after = Number(params.after)
      const page = Array.from({ length: 100 }, (_, i) => ({ ...p, posId: `x${after - i}`, uTime: String(after - 1 - i) }))
      return { code: '0', data: after > 900 ? page : [] }
    }
    const trades = await fetchOkxTrades(call, 950, 1100)
    expect(trades.length).toBe(150) // uTime 950…1099
    expect(calls.map((c) => c.after)).toEqual(['1100', '1000'])
  })
  it('права ключа: read_only — да, trade / withdraw — нет', async () => {
    const call = (perm: string): CexCall => async () => ({ code: '0', data: [{ perm }] })
    expect(await checkOkxKey(call('read_only'))).toEqual({ readOnly: true })
    expect(await checkOkxKey(call('read_only,trade'))).toEqual({ readOnly: false })
    await expect(checkOkxKey(async () => ({ code: '50110', msg: 'IP' }))).rejects.toMatchObject({ kind: 'KEY_IP' })
  })
})

describe('Bitget', () => {
  // примеры ответов UTA (v3) и классического аккаунта (v2) — из документации Bitget / CCXT
  const v3 = {
    positionId: '1322441328637100049', category: 'USDT-FUTURES', symbol: 'BTCUSDT', posSide: 'long', openPriceAvg: '107003.7', closePriceAvg: '107005.4',
    openTotalPos: '0.0001', closeTotalPos: '0.0001', cumRealisedPnl: '0.00017', netProfit: '-0.01267055', totalFunding: '0',
    openFeeTotal: '-0.00642022', closeFeeTotal: '-0.00642032', createdTime: '1751020503195', updatedTime: '1751020520458',
  }
  const v2 = {
    symbol: 'XRPUSDT', holdSide: 'long', openAvgPrice: '0.64967', closeAvgPrice: '0.58799', openTotalPos: '10', closeTotalPos: '10', pnl: '-0.6168',
    netProfit: '-0.65356802', totalFunding: '-0.02934206', openFee: '-0.00389802', closeFee: '-0.00352794', ctime: '1709590322199', utime: '1709667583395',
  }
  it('UTA: позиция → сделка, PnL сходится', () => {
    const t = bitgetPositionToTrade(v3, 'USDT-FUTURES')!
    expect(t).toMatchObject({ exchange: 'bitget', symbol: 'BTCUSDT', side: 'long', entry_price: 107003.7, exit_price: 107005.4, pnl: -0.01267055, funding: 0, external_id: 'bg:BTCUSDT:long:1751020503195' })
    expect(t.fee).toBeCloseTo(0.01284054, 8)
    consistent(t)
  })
  it('классический аккаунт: те же поля под другими именами', () => {
    const t = bitgetPositionToTrade(v2, 'USDT-FUTURES')!
    expect(t).toMatchObject({ symbol: 'XRPUSDT', size_usd: 6.4967, pnl: -0.65356802, external_id: 'bg:XRPUSDT:long:1709590322199' })
    consistent(t)
  })
  it('UTA или классический — по /api/v3/account/settings; все три вида фьючерсов', async () => {
    const seen: string[] = []
    const call: CexCall = async (path, params) => {
      seen.push(`${path} ${params.category ?? params.productType ?? ''}`)
      if (path === '/api/v3/account/settings') return { code: '40084', msg: 'not unified' }
      return { code: '00000', data: { list: params.productType === 'USDT-FUTURES' ? [v2] : [], endId: '' } }
    }
    const trades = await fetchBitgetTrades(call, 1709000000000, 1709000000000 + 10 * 86_400_000)
    expect(trades).toHaveLength(1)
    expect(seen.filter((s) => s.startsWith('/api/v2/'))).toEqual(['/api/v2/mix/position/history-position USDT-FUTURES', '/api/v2/mix/position/history-position USDC-FUTURES', '/api/v2/mix/position/history-position COIN-FUTURES'])
  })
  it('права ключа: read-only — да, read-and-write — нет; неверный ключ — KEY_INVALID', async () => {
    expect(await checkBitgetKey(async () => ({ code: '00000', data: { permType: 'read-only' } }))).toEqual({ readOnly: true })
    expect(await checkBitgetKey(async () => ({ code: '00000', data: { permType: 'read-and-write' } }))).toEqual({ readOnly: false })
    await expect(checkBitgetKey(async () => ({ code: '40037', msg: 'Apikey does not exist' }))).rejects.toMatchObject({ kind: 'KEY_INVALID' })
  })
})

describe('BingX', () => {
  // пример из CCXT (реальный ответ): LTC-USDT, positionAmt «30.0» — в контрактах, а не в монетах
  const p = {
    positionId: '1861675561156571136', symbol: 'LTC-USDT', isolated: false, positionSide: 'LONG', openTime: 1732693017000, updateTime: 1733310292000,
    avgPrice: '95.18', avgClosePrice: '129.48', realisedProfit: '102.89', netProfit: '99.63', positionAmt: '30.0', closePositionAmt: '30.0',
    leverage: 6, closeAllPositions: true, positionCommission: '-0.33699650000000003', totalFunding: '-2.921461693902908',
  }
  it('позиция → сделка: количество из валового PnL (≈ 3 LTC), итог — netProfit', () => {
    const t = bingxPositionToTrade(p)!
    expect(t).toMatchObject({ exchange: 'bingx', symbol: 'LTCUSDT', side: 'long', leverage: 6, pnl: 99.63, external_id: 'bx:1861675561156571136' })
    expect(t.size_usd).toBeCloseTo(285.5, 0)
    expect(t.fee).toBeCloseTo(0.337, 3)
    expect(t.funding).toBeCloseTo(-2.9215, 4)
    // у BingX netProfit округлён до центов — сходится с точностью до цента
    const gross = grossPnl({ marketType: 'linear', side: t.side, entryPrice: t.entry_price, exitPrice: t.exit_price, sizeUsd: t.size_usd })!
    expect(Math.abs(gross - t.fee + t.funding - t.pnl)).toBeLessThan(0.01)
  })
  it('шорт и незакрытая до конца позиция', () => {
    expect(bingxPositionToTrade({ ...p, positionSide: 'SHORT', avgClosePrice: '90', realisedProfit: '15.54' })!.side).toBe('short')
    expect(bingxPositionToTrade({ ...p, closeAllPositions: false })).toBeNull()
  })
  it('пары — из движения средств, история — по каждой паре', async () => {
    const seen: string[] = []
    const call: CexCall = async (path, params) => {
      seen.push(path)
      if (path === '/openApi/swap/v2/user/income') return { code: 0, data: params.currency === 'USDT' && params.startTime === 0 ? [{ symbol: 'LTC-USDT' }, { symbol: 'LTC-USDT' }] : [] }
      return { code: 0, data: { positionHistory: [p] } }
    }
    const trades = await fetchBingxTrades(call, 0, 10 * 86_400_000)
    expect(trades).toHaveLength(1)
    expect(seen.filter((s) => s.endsWith('positionHistory'))).toHaveLength(1)
  })
  it('права ключа: только «Чтение» (2)', async () => {
    expect(await checkBingxKey(async () => ({ apiKey: 'x', permissions: [2], ipAddresses: [] }))).toEqual({ readOnly: true })
    expect(await checkBingxKey(async () => ({ code: 0, data: { permissions: [1, 2] } }))).toEqual({ readOnly: false })
    await expect(checkBingxKey(async () => ({ code: 100413, msg: 'Incorrect apiKey' }))).rejects.toMatchObject({ kind: 'KEY_INVALID' })
  })
})

describe('Binance', () => {
  const f = (id: number, side: 'BUY' | 'SELL', qty: string, price: string, realizedPnl = '0', extra: Partial<BinanceFill> = {}): BinanceFill => ({
    id, symbol: 'BTCUSDT', side, positionSide: 'BOTH', price, qty, realizedPnl, commission: '0.1', commissionAsset: 'USDT', time: 1730000000000 + id * 1000, ...extra,
  })

  it('исполнения → позиция от нуля до нуля: средние цены, комиссии, фандинг за время позиции', () => {
    const fills = [f(1, 'BUY', '0.01', '60000'), f(2, 'BUY', '0.01', '62000'), f(3, 'SELL', '0.02', '63000', '40')]
    const funding = [
      { symbol: 'BTCUSDT', incomeType: 'FUNDING_FEE', income: '-0.5', time: 1730000001500 },
      { symbol: 'BTCUSDT', incomeType: 'FUNDING_FEE', income: '-9', time: 1720000000000 }, // до позиции — не считается
    ]
    const { trades, openStarts } = binanceFillsToTrades(fills, funding)
    expect(openStarts).toEqual([])
    expect(trades).toHaveLength(1)
    const t = trades[0]
    expect(t).toMatchObject({ exchange: 'binance', symbol: 'BTCUSDT', side: 'long', entry_price: 61000, exit_price: 63000, size_usd: 1220, funding: -0.5, external_id: 'bn:BTCUSDT|BOTH:1' })
    expect(t.fee).toBeCloseTo(0.3)
    expect(t.pnl).toBeCloseTo(40 - 0.3 - 0.5)
    consistent(t)
  })
  it('переворот одним исполнением: закрытие лонга и новый шорт', () => {
    const { trades, openStarts } = binanceFillsToTrades([f(1, 'BUY', '1', '100'), f(2, 'SELL', '3', '110', '10'), f(3, 'BUY', '2', '105', '10')])
    expect(trades.map((t) => [t.side, t.entry_price, t.exit_price, t.size_usd])).toEqual([['long', 100, 110, 100], ['short', 110, 105, 220]])
    expect(trades[0].fee).toBeCloseTo(0.1 + 0.1 / 3)
    expect(openStarts).toEqual([])
  })
  it('хвост позиции, открытой до начала периода, пропускаем; открытая позиция — в курсор', () => {
    const { trades, openStarts } = binanceFillsToTrades([f(1, 'SELL', '1', '100', '5'), f(2, 'BUY', '1', '100'), f(3, 'BUY', '1', '101')])
    expect(trades).toEqual([])
    expect(openStarts).toEqual([1730000002000])
  })
  it('режим хеджирования: LONG и SHORT — отдельные позиции', () => {
    const { trades } = binanceFillsToTrades([
      f(1, 'BUY', '1', '100', '0', { positionSide: 'LONG' }),
      f(2, 'SELL', '1', '100', '0', { positionSide: 'SHORT' }),
      f(3, 'SELL', '1', '110', '10', { positionSide: 'LONG' }),
      f(4, 'BUY', '1', '90', '10', { positionSide: 'SHORT' }),
    ])
    expect(trades.map((t) => [t.side, t.pnl.toFixed(1)]).sort()).toEqual([['long', '9.8'], ['short', '9.8']])
  })
  it('синхронизация: пары из движения средств, исполнения по паре; курсор = начало открытой позиции', async () => {
    const seen: string[] = []
    const call: CexCall = async (path, params) => {
      seen.push(`${path} ${params.symbol ?? ''}`)
      if (path === '/fapi/v1/income') return params.startTime === 0 ? [{ symbol: 'BTCUSDT', incomeType: 'COMMISSION', income: '-0.1', time: 1000 }] : []
      return params.startTime === 0 ? [f(1, 'BUY', '1', '100', '0', { time: 5000 })] : []
    }
    const r = await fetchBinanceTrades(call, 0, 8 * 86_400_000)
    expect(r).toEqual({ trades: [], cursor: 5000 })
    expect(seen.filter((s) => s.startsWith('/fapi/v1/userTrades'))).toEqual(['/fapi/v1/userTrades BTCUSDT', '/fapi/v1/userTrades BTCUSDT'])
  })
  it('права ключа: только чтение; ошибка ключа -2015 → KEY_INVALID', async () => {
    const base = { ipRestrict: false, enableReading: true, enableWithdrawals: false, enableFutures: false, enableSpotAndMarginTrading: false, permitsUniversalTransfer: false, enableMargin: false }
    expect(await checkBinanceKey(async () => base)).toEqual({ readOnly: true })
    expect(await checkBinanceKey(async () => ({ ...base, enableFutures: true }))).toEqual({ readOnly: false })
    await expect(checkBinanceKey(async () => ({ code: -2015, msg: 'Invalid API-key, IP, or permissions for action.' }))).rejects.toMatchObject({ kind: 'KEY_INVALID' })
  })
})
