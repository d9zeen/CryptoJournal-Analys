import { describe, expect, it } from 'vitest'
import { EVM_CHAINS, evmBalances, evmChainBalances, rpcBatch, solanaBalances, units, type CoinPlatforms } from './wallets'
import { fetchBalances } from './balances'

const ADDR = '0x00000000000000000000000000000000000000aa'
const SOL = 'DRpbCBMxVnDK7maPM5tGv6MvB3v1sRMC86PZ8okm21hy'
const USDC_ETH = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
const USDC_SOL = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const COINS: CoinPlatforms[] = [
  { symbol: 'USDC', platforms: { ethereum: USDC_ETH, base: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', solana: USDC_SOL } },
  { symbol: 'PEPE', platforms: { ethereum: '0x6982508145454ce325ddbe47a25d4ec3d2311933' } },
  { symbol: 'BTC', platforms: {} },
]
const hex = (v: bigint) => '0x' + v.toString(16).padStart(64, '0')

type Req = { id: number; method: string; params: unknown[] }
/** Узел-заглушка: ответы по методу и контракту */
function node(answer: (url: string, r: Req) => unknown, calls: { url: string; body: Req[] }[] = []) {
  return (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Req[]
    calls.push({ url, body })
    return new Response(JSON.stringify(body.map((r) => {
      const result = answer(url, r)
      return result instanceof Error ? { jsonrpc: '2.0', id: r.id, error: { message: result.message } } : { jsonrpc: '2.0', id: r.id, result }
    })))
  }) as unknown as typeof fetch
}

describe('кошельки: единицы и пачки', () => {
  it('10^decimals без потери: 1,5 USDC (6 знаков), 2 ETH (18)', () => {
    expect(units(1_500_000n, 6)).toBe(1.5)
    expect(units(2n * 10n ** 18n, 18)).toBe(2)
    expect(units(0n, 18)).toBe(0)
  })
  it('пачки по 40 запросов; ошибка одного — исключение, с soft — null', async () => {
    const calls: { url: string; body: Req[] }[] = []
    const f = node((_u, r) => (r.params[0] === 'bad' ? new Error('reverted') : r.params[0]), calls)
    const reqs = Array.from({ length: 45 }, (_, i) => ({ method: 'x', params: [i === 3 ? 'bad' : i] }))
    await expect(rpcBatch('u', reqs, f)).rejects.toThrow(/RPC_ERROR/)
    const res = await rpcBatch('u', reqs, f, true)
    expect(calls.slice(-2).map((c) => c.body.length)).toEqual([40, 5])
    expect(res[3]).toBeNull()
    expect(res[44]).toBe(44)
  })
})

describe('кошелёк EVM', () => {
  it('родная монета + токены из нашего списка; decimals — только у ненулевых', async () => {
    const calls: { url: string; body: Req[] }[] = []
    const f = node((_u, r) => {
      if (r.method === 'eth_getBalance') return '0x' + (15n * 10n ** 17n).toString(16) // 1,5 ETH
      const { to, data } = r.params[0] as { to: string; data: string }
      if (data === '0x313ce567') return hex(6n)
      expect(data).toBe('0x70a08231' + ADDR.slice(2).padStart(64, '0'))
      return to === USDC_ETH ? hex(250_000_000n) : '0x' // 250 USDC, PEPE — 0
    }, calls)
    const out = await evmChainBalances(EVM_CHAINS[0], ADDR, COINS, f)
    expect(out).toEqual([{ account: 'wallet', symbol: 'ETH', amount: 1.5 }, { account: 'wallet', symbol: 'USDC', amount: 250 }])
    expect(calls[0].body).toHaveLength(3) // баланс + USDC + PEPE
    expect(calls[1].body).toHaveLength(1) // decimals только у USDC
  })
  it('все шесть сетей одним адресом; одинаковые монеты складываются; сеть не ответила — ошибка целиком', async () => {
    const f = node((url, r) => {
      if (r.method === 'eth_getBalance') return url.includes('bsc') ? '0x' + (10n ** 18n).toString(16) : '0x0'
      const { data } = r.params[0] as { data: string }
      if (data === '0x313ce567') return hex(6n)
      return hex(1_000_000n) // по 1 USDC в каждой сети, где он есть (ethereum, base)
    })
    const items = await fetchBalances({ exchange: 'evm', api_key: ADDR }, { cexCall: async () => null, fetchFn: f, coins: COINS })
    expect(items).toEqual(expect.arrayContaining([{ account: 'wallet', symbol: 'BNB', amount: 1 }, { account: 'wallet', symbol: 'USDC', amount: 2 }, { account: 'wallet', symbol: 'PEPE', amount: 1 }]))
    const down = (async () => new Response('bad gateway', { status: 502 })) as unknown as typeof fetch
    await expect(evmBalances(ADDR, COINS, down)).rejects.toThrow(/RPC_HTTP_502/)
  })
  it('контракт отказал на decimals — монету пропускаем, а не угадываем', async () => {
    const f = node((_u, r) => {
      if (r.method === 'eth_getBalance') return '0x0'
      const { data } = r.params[0] as { data: string }
      return data === '0x313ce567' ? new Error('execution reverted') : hex(5n)
    })
    expect(await evmChainBalances(EVM_CHAINS[0], ADDR, COINS, f)).toEqual([])
  })
  it('сбой узла на токене (лимит частоты) — ошибка целиком, а не «монеты нет» (иначе ложный провал на графике)', async () => {
    const f = node((_u, r) => (r.method === 'eth_getBalance' ? '0x0' : new Error('rate limit exceeded')))
    await expect(evmChainBalances(EVM_CHAINS[0], ADDR, COINS, f)).rejects.toThrow(/RPC_ERROR/)
  })
})

describe('кошелёк Solana', () => {
  it('SOL + токены из нашего списка по mint; чужие (спам) — мимо', async () => {
    const acc = (mint: string, amount: string, decimals: number) => ({ account: { data: { parsed: { info: { mint, tokenAmount: { amount, decimals } } } } } })
    const f = node((_u, r) => {
      if (r.method === 'getBalance') return { value: 2_500_000_000 }
      const program = (r.params[1] as { programId: string }).programId
      return program.startsWith('Tokenkeg') ? { value: [acc(USDC_SOL, '12345678', 6), acc('SpamSpamSpamSpamSpamSpamSpamSpamSpam1', '999', 0)] } : { value: [] }
    })
    expect(await solanaBalances(SOL, COINS, f)).toEqual([
      { account: 'wallet', symbol: 'SOL', amount: 2.5 },
      { account: 'wallet', symbol: 'USDC', amount: 12.345678 },
    ])
    await expect(solanaBalances('0xabc', COINS, f)).rejects.toThrow('BAD_WALLET')
  })
})
