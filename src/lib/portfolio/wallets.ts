/**
 * Портфель, кошельки (0021): монеты на адресе EVM (одним адресом — шесть сетей) и Solana. Только чтение публичных данных, без ключей.
 *
 * Где спрашиваем: публичные узлы PublicNode (JSON-RPC, без ключа; браузер ходит напрямую — адреса в CSP, сервер — так же).
 * Какие монеты: только из нашего списка (coins.platforms — адреса контрактов CoinGecko у топ-500 и монет, которые держат).
 * Поэтому спам-раздачи («claim reward») в портфель не попадают, а запросов немного: balanceOf у известных контрактов пачками.
 *
 *  - EVM: eth_getBalance (ETH / BNB / POL) + eth_call balanceOf(address) у контрактов сети; у ненулевых — decimals();
 *  - Solana: getBalance (SOL) + getTokenAccountsByOwner (обычные токены и Token-2022) → mint → монета по coins.platforms.solana.
 * Сеть не ответила — ошибка целиком: старые балансы остаются (replace_holdings не вызывается), в следующий раз попробуем снова.
 */

/** Монета с адресами контрактов (из coins) */
export type CoinPlatforms = { symbol: string; platforms: Record<string, string> | null }
export type WalletBalance = { account: 'wallet'; symbol: string; amount: number }

export const EVM_CHAINS = [
  { id: 'ethereum', rpc: 'https://ethereum-rpc.publicnode.com', native: 'ETH' },
  { id: 'arbitrum-one', rpc: 'https://arbitrum-one-rpc.publicnode.com', native: 'ETH' },
  { id: 'base', rpc: 'https://base-rpc.publicnode.com', native: 'ETH' },
  { id: 'optimistic-ethereum', rpc: 'https://optimism-rpc.publicnode.com', native: 'ETH' },
  { id: 'binance-smart-chain', rpc: 'https://bsc-rpc.publicnode.com', native: 'BNB' },
  { id: 'polygon-pos', rpc: 'https://polygon-bor-rpc.publicnode.com', native: 'POL' },
] as const
export const SOLANA_RPC = 'https://solana-rpc.publicnode.com'
const TOKEN_PROGRAMS = ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb']

/** Запросов в одной пачке JSON-RPC (публичные узлы режут большие пачки) */
const BATCH = 40

export const isEvmAddress = (a: string) => /^0x[0-9a-f]{40}$/.test(a)
export const isSolanaAddress = (a: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)

type RpcReq = { method: string; params: unknown[] }
type RpcRes = { id?: number; result?: unknown; error?: { message?: string } }

/**
 * Пачка JSON-RPC → ответы по порядку. Ошибка сети / узла — исключение; ошибка одного запроса — тоже,
 * а с soft = true — null на его месте (контракт монеты отказал — не повод терять весь кошелёк).
 */
export async function rpcBatch(url: string, reqs: RpcReq[], fetchFn: typeof fetch = fetch, soft = false): Promise<unknown[]> {
  const out: unknown[] = []
  for (let i = 0; i < reqs.length; i += BATCH) {
    const part = reqs.slice(i, i + BATCH)
    const res = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(part.map((r, k) => ({ jsonrpc: '2.0', id: k, method: r.method, params: r.params }))),
    })
    if (!res.ok) throw new Error(`RPC_HTTP_${res.status} network`)
    const body = (await res.json()) as RpcRes[] | RpcRes
    const list = Array.isArray(body) ? body : [body]
    const byId = new Map(list.map((x) => [x.id, x]))
    for (let k = 0; k < part.length; k++) {
      const r = byId.get(k)
      if (r && !r.error) out.push(r.result)
      else if (soft && r) out.push(null)
      else throw new Error(`RPC_ERROR ${r?.error?.message ?? 'no answer'} network`)
    }
  }
  return out
}

const hexToBig = (v: unknown): bigint => (typeof v === 'string' && /^0x[0-9a-f]*$/i.test(v) && v.length > 2 ? BigInt(v.slice(0, 66)) : 0n)
/** Целое число в мельчайших единицах → обычное (10^decimals) */
export function units(raw: bigint, decimals: number): number {
  if (raw <= 0n) return 0
  const d = BigInt(10) ** BigInt(Math.min(Math.max(decimals, 0), 36))
  return Number(raw / d) + Number(raw % d) / Number(d)
}
const pad = (addr: string) => addr.slice(2).padStart(64, '0')

/** Монеты одной сети: адрес контракта → символ (у одного контракта — монета с большей капитализацией, она в списке раньше) */
function tokensOn(chain: string, coins: CoinPlatforms[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const c of coins) {
    const addr = c.platforms?.[chain]
    if (addr && !out.has(addr)) out.set(addr, c.symbol)
  }
  return out
}

/** Одна сеть EVM: родная монета + токены из нашего списка */
export async function evmChainBalances(chain: (typeof EVM_CHAINS)[number], address: string, coins: CoinPlatforms[], fetchFn: typeof fetch = fetch): Promise<WalletBalance[]> {
  const tokens = [...tokensOn(chain.id, coins)]
  const first = await rpcBatch(
    chain.rpc,
    [
      { method: 'eth_getBalance', params: [address, 'latest'] },
      ...tokens.map(([contract]) => ({ method: 'eth_call', params: [{ to: contract, data: `0x70a08231${pad(address)}` }, 'latest'] })),
    ],
    fetchFn,
    true,
  )
  if (first[0] === null) throw new Error(`RPC_ERROR ${chain.id} balance network`)
  const out: WalletBalance[] = []
  const native = units(hexToBig(first[0]), 18)
  if (native > 0) out.push({ account: 'wallet', symbol: chain.native, amount: native })
  const held = tokens.map(([contract, symbol], i) => ({ contract, symbol, raw: hexToBig(first[i + 1]) })).filter((x) => x.raw > 0n)
  if (!held.length) return out
  const decs = await rpcBatch(chain.rpc, held.map((x) => ({ method: 'eth_call', params: [{ to: x.contract, data: '0x313ce567' }, 'latest'] })), fetchFn, true)
  held.forEach((x, i) => {
    // decimals не ответил — монету пропускаем (иначе можно ошибиться в миллиард раз)
    if (decs[i] === null) return
    const d = Number(hexToBig(decs[i]))
    const amount = units(x.raw, d <= 36 ? d : 18)
    if (amount > 0) out.push({ account: 'wallet', symbol: x.symbol, amount })
  })
  return out
}

/** Все сети EVM одним адресом (сети спрашиваем одновременно) */
export async function evmBalances(address: string, coins: CoinPlatforms[], fetchFn: typeof fetch = fetch): Promise<WalletBalance[]> {
  const addr = address.toLowerCase()
  if (!isEvmAddress(addr)) throw new Error('BAD_WALLET')
  const parts = await Promise.all(EVM_CHAINS.map((c) => evmChainBalances(c, addr, coins, fetchFn)))
  return parts.flat()
}

type ParsedAccount = { account?: { data?: { parsed?: { info?: { mint?: unknown; tokenAmount?: { amount?: unknown; decimals?: unknown } } } } } }

/** Solana: SOL + токены из нашего списка (по адресу mint) */
export async function solanaBalances(address: string, coins: CoinPlatforms[], fetchFn: typeof fetch = fetch): Promise<WalletBalance[]> {
  if (!isSolanaAddress(address)) throw new Error('BAD_WALLET')
  const [bal, ...programs] = await rpcBatch(
    SOLANA_RPC,
    [
      { method: 'getBalance', params: [address] },
      ...TOKEN_PROGRAMS.map((programId) => ({ method: 'getTokenAccountsByOwner', params: [address, { programId }, { encoding: 'jsonParsed' }] })),
    ],
    fetchFn,
  )
  const out: WalletBalance[] = []
  const lamports = Number((bal as { value?: unknown })?.value ?? 0)
  if (Number.isFinite(lamports) && lamports > 0) out.push({ account: 'wallet', symbol: 'SOL', amount: lamports / 1e9 })
  const mints = tokensOn('solana', coins)
  for (const p of programs) {
    for (const a of ((p as { value?: ParsedAccount[] })?.value ?? []) as ParsedAccount[]) {
      const info = a.account?.data?.parsed?.info
      const symbol = typeof info?.mint === 'string' ? mints.get(info.mint) : undefined
      const raw = typeof info?.tokenAmount?.amount === 'string' && /^\d{1,40}$/.test(info.tokenAmount.amount) ? BigInt(info.tokenAmount.amount) : 0n
      const amount = units(raw, Number(info?.tokenAmount?.decimals ?? 0))
      if (symbol && amount > 0) out.push({ account: 'wallet', symbol, amount })
    }
  }
  return out
}
