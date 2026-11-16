/**
 * Адреса контрактов монет по сетям (CoinGecko /coins/list?include_platform=true) → coins.platforms (0021).
 * По ним «Портфель» спрашивает балансы кошелька только у настоящих монет из нашего списка: спам-токены не попадают.
 * Чистая функция без Deno — проверяют тесты Vitest (platforms.test.ts).
 */

/** Сети, которые читаем у кошельков: ключи CoinGecko */
export const WALLET_PLATFORMS = ['ethereum', 'arbitrum-one', 'base', 'optimistic-ethereum', 'binance-smart-chain', 'polygon-pos', 'solana'] as const

const EVM_ADDRESS = /^0x[0-9a-f]{40}$/
const SOLANA_MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

/** Список CoinGecko → { id монеты: { сеть: адрес } } только для наших монет (ids) и только наших сетей; у монеты без контрактов — {} */
export function pickPlatforms(list: unknown, ids: Iterable<string>): Map<string, Record<string, string>> {
  const want = new Set(ids)
  const out = new Map<string, Record<string, string>>()
  for (const id of want) out.set(id, {})
  if (!Array.isArray(list)) return out
  for (const c of list as { id?: unknown; platforms?: unknown }[]) {
    if (typeof c?.id !== 'string' || !want.has(c.id) || !c.platforms || typeof c.platforms !== 'object') continue
    const p: Record<string, string> = {}
    for (const chain of WALLET_PLATFORMS) {
      const raw = (c.platforms as Record<string, unknown>)[chain]
      if (typeof raw !== 'string') continue
      const addr = chain === 'solana' ? raw.trim() : raw.trim().toLowerCase()
      if (chain === 'solana' ? SOLANA_MINT.test(addr) : EVM_ADDRESS.test(addr)) p[chain] = addr
    }
    out.set(c.id, p)
  }
  return out
}
