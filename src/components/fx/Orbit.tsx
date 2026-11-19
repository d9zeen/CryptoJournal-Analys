/**
 * №5 «Орбита» (образец — 21st.dev orbiting-circles): вокруг логотипа дневника на двух орбитах медленно кружат биржи.
 * Кольцо вращается (transform rotate), значки — в обратную сторону, поэтому всегда стоят ровно. Без мигания.
 * «Биржи» без подключений, первый вход; с подключениями (владелец 19.11.2026) — lit: все биржи обычные, подключённая — чуть подсвечена
 * (тонкая рамка и лёгкий ореол цвета кнопок; «не надо излишков» — без приглушения остальных); подключённые кошельки (EVM / Solana) встают на внутреннюю орбиту.
 * Линии орбит — заметные (muted, владелец 19.11.2026: «сделай их более яркими»).
 */
import { ExchangeLogo } from '@/components/ExchangeLogo'

const OUTER = ['bybit', 'binance', 'okx', 'bingx', 'bitget']
const INNER = ['hyperliquid', 'polymarket', 'mexc']

function Ring({ items, radius, reverse, lit }: { items: string[]; radius: number; reverse?: boolean; lit?: ReadonlySet<string> }) {
  return (
    <div className={`orbit-ring absolute inset-0 ${reverse ? 'orbit-reverse' : ''}`}>
      {items.map((m, i) => {
        const a = (i / items.length) * Math.PI * 2
        return (
          <div
            key={m}
            data-orbit-sat={m}
            data-lit={lit ? (lit.has(m) ? 'on' : 'off') : undefined}
            className="absolute top-1/2 left-1/2 -mt-5 -ml-5 size-10"
            style={{ transform: `translate(${Math.cos(a) * radius}px, ${Math.sin(a) * radius}px)` }}
          >
            <div className={`orbit-sat size-10 overflow-hidden rounded-xl border ${lit?.has(m) ? 'border-primary/60 ring-3 ring-primary/15' : 'border-border'}`}>
              <ExchangeLogo id={m} className="size-full" />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function Orbit({ size = 260, lit }: { size?: number; lit?: ReadonlySet<string> }) {
  const outer = size / 2 - 16
  const inner = outer * 0.68
  const innerItems = [...INNER, ...['evm', 'solana'].filter((w) => lit?.has(w))]
  return (
    <div aria-hidden className="relative shrink-0" style={{ width: size, height: size }}>
      <div className="absolute top-1/2 left-1/2 -translate-1/2 rounded-full border-[1.5px] border-dashed border-muted/80" style={{ width: outer * 2, height: outer * 2 }} />
      <div className="absolute top-1/2 left-1/2 -translate-1/2 rounded-full border-[1.5px] border-dashed border-muted/80" style={{ width: inner * 2, height: inner * 2 }} />
      <Ring items={OUTER} radius={outer} lit={lit} />
      <Ring items={innerItems} radius={inner} reverse lit={lit} />
      <div className="absolute top-1/2 left-1/2 grid size-13 -translate-1/2 place-items-center rounded-2xl border border-primary/50 bg-primary/12 text-primary">
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 17l5-5 4 4 8-9" />
          <path d="M14 7h6v6" />
        </svg>
      </div>
    </div>
  )
}
