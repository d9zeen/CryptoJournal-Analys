/**
 * №6 «Счётчик-барабан» (образец — 21st.dev number-ticker): каждая цифра — свой барабан 0…9, прокручивается к значению
 * с небольшой задержкой по разрядам (transform translateY). Остальные символы (пробелы, запятая, $, +, −) стоят на месте.
 * Для чтения с экрана — обычный текст (sr-only), барабаны скрыты. При «уменьшить движение» — сразу итог.
 */
import { useEffect, useState } from 'react'
import { prefersReducedMotion } from '@/lib/motion'

const DIGITS = '0123456789'

export function DigitTicker({ text, className = '', delay = 0 }: { text: string; className?: string; delay?: number }) {
  // первый кадр — все барабаны на нуле, потом едут к своим цифрам
  const [ready, setReady] = useState(() => prefersReducedMotion())
  useEffect(() => {
    if (ready) return
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)))
    return () => cancelAnimationFrame(id)
  }, [ready])
  let k = 0
  return (
    <span data-ticker className={`inline-flex items-end align-[-0.12em] leading-none ${className}`}>
      <span className="sr-only">{text}</span>
      <span aria-hidden className="inline-flex items-end">
        {text.split('').map((ch, i) => {
          if (!DIGITS.includes(ch))
            return (
              <span key={i} className="leading-none whitespace-pre">
                {ch}
              </span>
            )
          const n = Number(ch)
          const d = delay + k++ * 0.09
          return (
            <span key={i} className="inline-block h-[1em] overflow-hidden leading-none">
              <span
                className="ticker-col flex flex-col"
                style={{ transform: `translateY(-${ready ? n : 0}em)`, transitionDelay: `${d}s` }}
              >
                {DIGITS.split('').map((x) => (
                  <span key={x} className="h-[1em] leading-none">
                    {x}
                  </span>
                ))}
              </span>
            </span>
          )
        })}
      </span>
    </span>
  )
}
