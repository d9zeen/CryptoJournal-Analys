/**
 * Блок плавно появляется, когда доезжает до экрана (при загрузке и прокрутке, один раз):
 * прозрачность + сдвиг на 16px вверх, 550ms. delay — «лесенка» для соседних блоков.
 * Кто попросил систему «уменьшить движение» — блок виден сразу, без анимации.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { prefersReducedMotion } from '@/lib/motion'

/** zoom — ещё и лёгкое «приближение» 97 % → 100 % (большое превью дашборда на первом экране) */
export function Reveal({
  children,
  className = '',
  delay = 0,
  zoom = false,
  as: Tag = 'div',
}: {
  children: ReactNode
  className?: string
  delay?: number
  zoom?: boolean
  as?: 'div' | 'section' | 'li' | 'h2' | 'details'
}) {
  const ref = useRef<HTMLElement | null>(null)
  const [shown, setShown] = useState(() => prefersReducedMotion() || typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    if (shown || !ref.current) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true)
          io.disconnect()
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    )
    io.observe(ref.current)
    return () => io.disconnect()
  }, [shown])
  return (
    <Tag
      ref={(el: HTMLElement | null) => {
        ref.current = el
      }}
      className={`transition-[opacity,translate,scale] ease-[cubic-bezier(0.22,1,0.36,1)] ${zoom ? 'duration-[900ms]' : 'duration-[550ms]'} ${shown ? 'translate-y-0 scale-100 opacity-100' : `translate-y-4 opacity-0 ${zoom ? 'scale-[0.97]' : ''}`} ${className}`}
      style={{ transitionDelay: `${delay}ms` } as CSSProperties}
    >
      {children}
    </Tag>
  )
}
