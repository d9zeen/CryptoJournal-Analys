import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '@/lib/motion'

/**
 * №13 Число прокручивается: когда меняется token (например, период), старый текст уходит вверх с затуханием,
 * новый приходит снизу (0.45s). Если меняется только текст (докрутка useCountUp) — просто показываем новый.
 */
export function RollNumber({ text, token, className = '' }: { text: string; token?: unknown; className?: string }) {
  const [old, setOld] = useState<{ text: string; n: number } | null>(null)
  const prevToken = useRef(token)
  const prevText = useRef(text)
  const n = useRef(0)

  useEffect(() => {
    const changed = prevToken.current !== token && prevText.current !== text
    if (changed && !prefersReducedMotion()) {
      n.current += 1
      setOld({ text: prevText.current, n: n.current })
      const id = window.setTimeout(() => setOld(null), 460)
      prevToken.current = token
      prevText.current = text
      return () => window.clearTimeout(id)
    }
    prevToken.current = token
    prevText.current = text
  }, [text, token])

  return (
    <span className={`inline-grid align-bottom whitespace-nowrap [overflow-y:clip] ${className}`}>
      {old && (
        <span key={`o${old.n}`} aria-hidden className="animate-roll-out [grid-area:1/1]">
          {old.text}
        </span>
      )}
      <span key={old ? `n${old.n}` : 'n'} className={`[grid-area:1/1] ${old ? 'animate-roll-in' : ''}`}>
        {text}
      </span>
    </span>
  )
}
