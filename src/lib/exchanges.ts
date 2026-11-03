/** Биржи. Названия — имена собственные, не переводятся. 'other' подписывается из словаря. */
export const EXCHANGES = [
  { id: 'bybit', name: 'Bybit' },
  { id: 'bingx', name: 'BingX' },
  { id: 'okx', name: 'OKX' },
  { id: 'binance', name: 'Binance' },
  { id: 'bitget', name: 'Bitget' },
  { id: 'mexc', name: 'MEXC' },
  { id: 'other', name: null },
] as const

export function exchangeName(id: string, otherLabel: string): string {
  return EXCHANGES.find((e) => e.id === id)?.name ?? (id === 'other' ? otherLabel : id)
}
