import { describe, expect, it } from 'vitest'
import { baseCoin } from './coin'

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
