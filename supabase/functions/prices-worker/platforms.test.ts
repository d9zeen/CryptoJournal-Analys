import { describe, expect, it } from 'vitest'
import { pegged, pickPlatforms } from './platforms'

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

describe('стейблкоины — 1 $, пока держат привязку', () => {
  const row = (symbol: string, price: number) => ({ symbol, price, change_24h: -0.02, change_7d: 0.01 })
  it('USDT по 0,9992 $ — ровно 1 $ без изменения; отвязавшийся (0,97 $) — как есть; не стейблкоин — как есть', () => {
    expect(pegged(row('USDT', 0.9992))).toEqual({ symbol: 'USDT', price: 1, change_24h: 0, change_7d: 0 })
    expect(pegged(row('USDC', 0.97))).toEqual(row('USDC', 0.97))
    expect(pegged(row('BTC', 1.001))).toEqual(row('BTC', 1.001))
  })
})
