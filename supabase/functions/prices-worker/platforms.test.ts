import { describe, expect, it } from 'vitest'
import { pickPlatforms } from './platforms'

describe('адреса контрактов монет', () => {
  it('только наши монеты и наши сети; EVM — в нижнем регистре, Solana — как есть; мусор отброшен', () => {
    const list = [
      { id: 'usd-coin', platforms: { ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', solana: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', tron: 'TEkx', base: 'not-an-address' } },
      { id: 'bitcoin', platforms: {} },
      { id: 'scam', platforms: { ethereum: '0x0000000000000000000000000000000000000001' } },
    ]
    const p = pickPlatforms(list, ['usd-coin', 'bitcoin', 'ethereum'])
    expect(p.get('usd-coin')).toEqual({ ethereum: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', solana: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' })
    expect(p.get('bitcoin')).toEqual({})
    expect(p.get('ethereum')).toEqual({}) // нет в списке — пусто, чтобы не спрашивать снова каждый запуск
    expect(p.has('scam')).toBe(false)
  })
})
