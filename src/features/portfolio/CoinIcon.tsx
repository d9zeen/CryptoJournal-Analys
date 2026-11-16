/**
 * Иконка монеты: картинка из нашего Storage (bucket coin-icons, её туда кладёт prices-worker),
 * пока иконки нет или она не загрузилась — буквы монеты на плашке (как значки бирж на «Биржах»).
 */
import { useState } from 'react'
import { coinIconUrl } from './api'

export function CoinIcon({ symbol, icon, size = 32 }: { symbol: string; icon: string | null | undefined; size?: number }) {
  const [broken, setBroken] = useState(false)
  const src = broken ? null : coinIconUrl(icon ?? null)
  const box = { width: size, height: size }
  if (src)
    return (
      <img
        src={src}
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        width={size}
        height={size}
        onError={() => setBroken(true)}
        className="shrink-0 rounded-full bg-surface-2 object-cover"
        style={box}
      />
    )
  return (
    <span
      aria-hidden
      className="num grid shrink-0 place-items-center rounded-full bg-surface-2 font-bold text-muted"
      style={{ ...box, fontSize: Math.max(10, Math.round(size * 0.32)) }}
    >
      {symbol.slice(0, 3)}
    </span>
  )
}
