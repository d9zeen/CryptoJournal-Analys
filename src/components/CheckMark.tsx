import { useShown } from '@/lib/motion'

/** Галочка рисуется линией (stroke-dashoffset, .draw-path в theme.css). circle — с кругом вокруг (экран «Проверь почту») */
export function CheckMark({ className = 'size-5', circle = false }: { className?: string; circle?: boolean }) {
  const shown = useShown()
  if (circle)
    return (
      <svg
        viewBox="0 0 56 56"
        className={`${className} ${shown ? 'drawn' : ''}`}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="28" cy="28" r="24" strokeWidth={3} className="draw-path" style={{ '--len': 151, '--delay': '0.1s' } as React.CSSProperties} />
        <path d="M17 29l7.5 7.5L39 21" strokeWidth={3.2} className="draw-path" style={{ '--len': 32, '--delay': '0.55s' } as React.CSSProperties} />
      </svg>
    )
  return (
    <svg
      viewBox="0 0 24 24"
      className={`${className} ${shown ? 'drawn' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" className="draw-path" style={{ '--len': 24 } as React.CSSProperties} />
    </svg>
  )
}
