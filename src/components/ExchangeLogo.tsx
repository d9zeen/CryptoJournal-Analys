/**
 * Логотип биржи / сети (16.11.2026, просьба владельца — вместо букв «BY», «OK»): квадратные значки TradingView
 * (s3-symbol-logo.tradingview.com/provider/*.svg; EVM — значок Ethereum, Solana — значок SOL), у Polymarket — знак с их логотипа.
 * Файлы лежат в сборке (src/assets/exchanges) — браузер не ходит на чужие сайты (CSP). Нет логотипа — буквы, как раньше.
 */
const FILES = import.meta.glob<string>('../assets/exchanges/*.svg', { eager: true, query: '?url', import: 'default' })
const LOGOS: Record<string, string> = Object.fromEntries(Object.entries(FILES).map(([path, url]) => [path.split('/').pop()!.replace('.svg', ''), url]))

export const hasExchangeLogo = (id: string) => id in LOGOS

export function ExchangeLogo({ id, mono, className = 'size-7 rounded-lg', dim = false }: { id: string; mono?: string; className?: string; dim?: boolean }) {
  const src = LOGOS[id]
  if (src) return <img src={src} alt="" aria-hidden draggable={false} className={`shrink-0 object-cover ${dim ? 'opacity-50 grayscale' : ''} ${className}`} />
  return (
    <span aria-hidden className={`num grid shrink-0 place-items-center bg-surface-2 text-xs font-bold text-muted ${className}`}>
      {mono ?? id.slice(0, 2).toUpperCase()}
    </span>
  )
}
