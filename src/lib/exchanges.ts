/** Биржи. Названия — имена собственные, не переводятся. 'other' подписывается из словаря. */
export const EXCHANGES = [
  { id: 'bybit', name: 'Bybit' },
  { id: 'bingx', name: 'BingX' },
  { id: 'okx', name: 'OKX' },
  { id: 'binance', name: 'Binance' },
  { id: 'bitget', name: 'Bitget' },
  { id: 'mexc', name: 'MEXC' },
  { id: 'hyperliquid', name: 'Hyperliquid' },
  { id: 'polymarket', name: 'Polymarket' },
  { id: 'other', name: null },
] as const

/** Кошельки (0021): только для «Портфеля», сделок у них нет — в списки бирж сделок не входят */
export const WALLET_NAMES: Record<string, string> = { evm: 'EVM', solana: 'Solana' }

export function exchangeName(id: string, otherLabel: string): string {
  return EXCHANGES.find((e) => e.id === id)?.name ?? WALLET_NAMES[id] ?? (id === 'other' ? otherLabel : id)
}
