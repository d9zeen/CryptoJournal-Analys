/**
 * Определяем биржу по имени файла и колонкам — чтобы пользователю ничего не выбирать.
 * Биржа нужна для защиты от дублей (id сделки уникален внутри биржи) и для подписи в журнале.
 */
import { normalizeHeader } from './mapping'

const NAMES = ['bybit', 'binance', 'okx', 'bingx', 'bitget', 'mexc'] as const
export type DetectedExchange = (typeof NAMES)[number] | 'other'

/** Характерные колонки бирж (после normalizeHeader): все из набора должны быть в файле */
const SIGNATURES: [DetectedExchange, string[]][] = [
  ['bybit', ['closingdirection']],
  ['bybit', ['contracts', 'closedpl']],
  ['bybit', ['execfee', 'execprice']],
  ['binance', ['realizedprofit']],
  ['binance', ['pair', 'executed']],
  ['okx', ['instrument', 'positiondirection']],
  ['okx', ['instrument', 'avgopenprice']],
  ['okx', ['instrument', 'tradingunit']],
  ['bitget', ['futures', 'averageopeningprice']],
  ['bingx', ['avgopenprice', 'avgcloseprice', 'positionsize']],
]

export function detectExchange(headers: string[], filename = ''): DetectedExchange {
  const name = filename.toLowerCase()
  const byName = NAMES.find((n) => name.includes(n))
  if (byName) return byName
  const cols = new Set(headers.map(normalizeHeader))
  for (const [ex, sig] of SIGNATURES) if (sig.every((c) => cols.has(c))) return ex
  return 'other'
}
