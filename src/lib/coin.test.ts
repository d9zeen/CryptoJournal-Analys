import { describe, expect, it } from 'vitest'
import { baseCoin, quoteCoin } from './coin'

describe('baseCoin — монета из тикера пары', () => {
  it.each([
    ['BTCUSDT', 'BTC'],
    ['ETH-USDT-SWAP', 'ETH'],
    ['SOL/USDC', 'SOL'],
    ['HYPEUSDC', 'HYPE'],
    ['HYPE-PERP', 'HYPE'],
    ['1000PEPEUSDT', 'PEPE'],
    ['kPEPEUSDC', 'PEPE'],
    ['KAITOUSDT', 'KAITO'],
    ['BTC_USDT', 'BTC'],
    ['XAUT', 'XAUT'],
    ['USDT', 'USDT'],
    ['near', 'NEAR'],
    ['', ''],
  ])('%s → %s', (input, out) => expect(baseCoin(input)).toBe(out))
})

describe('quoteCoin — котировка пары', () => {
  it.each([
    ['BTCUSDT', 'USDT'],
    ['ETH-USDT-SWAP', 'USDT'],
    ['HYPEUSDC', 'USDC'],
    ['SOL/USD', 'USD'],
    ['BTC_FDUSD', 'FDUSD'],
    ['kPEPEUSDC', 'USDC'],
    ['XAUT', null],
    ['HYPE-PERP', null],
    ['USDT', null],
    ['USDC', null],
  ])('%s → %s', (input, out) => expect(quoteCoin(input)).toBe(out))
})

