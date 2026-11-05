/** Анимации интерфейса: уважаем системную настройку «уменьшить движение». */
import { useEffect, useRef, useState } from 'react'

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Число «докручивается» от 0 до value (только при первом показе), потом меняется сразу */
export function useCountUp(value: number, duration = 900): number {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? value : 0))
  const done = useRef(prefersReducedMotion())

  useEffect(() => {
    if (done.current) {
      setShown(value)
      return
    }
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / duration)
      setShown(value * (1 - Math.pow(1 - k, 3)))
      if (k < 1) frame = requestAnimationFrame(tick)
      else done.current = true
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, duration])

  return shown
}
