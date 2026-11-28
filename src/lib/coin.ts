/**
 * Монета из тикера пары (для плашек «логотип + тикер», владелец 28.11.2026: «везде, где есть монета»):
 * BTCUSDT → BTC, ETH-USDT-SWAP → ETH, SOL/USDC → SOL, HYPE-PERP → HYPE, 1000PEPEUSDT → PEPE, kPEPE → PEPE.
 * Пустая строка / непонятный тикер — как есть (в верхнем регистре).
 */
const QUOTES = /[-_/:]?(USDT|USDC|FDUSD|BUSD|USDE|USD|PERP)$/
const MULT = /^(1000000|100000|10000|1000|100|K)(?=[A-Z]{2,})/

export function baseCoin(symbol: string): string {
  let s = symbol.trim().toUpperCase()
  if (!s) return s
  s = s.replace(/-SWAP$/, '').replace(/[-_/]?PERP$/, '')
  // не отрезаем котировку, если от тикера ничего не останется (USDT → USDT)
  const cut = s.replace(QUOTES, '').replace(/[-_/:]$/, '')
  if (cut) s = cut
  // kPEPE у Hyperliquid — строчная k: проверяем по исходной записи
  const raw = symbol.trim()
  if (/^k[A-Z]{2,}/.test(raw)) s = s.slice(1)
  else s = s.replace(MULT, (m) => (m === 'K' ? 'K' : ''))
  return s
}
