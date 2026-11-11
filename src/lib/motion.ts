/**
 * Анимации интерфейса (образец — docs/animations-showcase.html). Без библиотек; уважаем системную настройку «уменьшить движение»:
 * тогда хуки сразу отдают итоговое состояние. Ключевые кадры и классы — src/styles/theme.css.
 */
import { useEffect, useRef, useState, type RefObject } from 'react'

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Есть мышь (наведение и точный указатель): наклон и подсветка под курсором — только тогда, на телефоне их нет */
export function hasFinePointer(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches
}

const ease = (k: number) => 1 - Math.pow(1 - k, 3)

/**
 * Число «докручивается»: при первом показе — от 0 до value, при следующих изменениях — от старого значения к новому
 * (новая сделка с биржи: PnL плавно пересчитывается). instant — сменить сразу (например, при смене периода число прокручивается RollNumber).
 */
export function useCountUp(value: number, duration = 1000, instant = false): number {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? value : 0))
  const from = useRef(prefersReducedMotion() ? value : 0)

  useEffect(() => {
    if (prefersReducedMotion() || instant || from.current === value) {
      from.current = value
      setShown(value)
      return
    }
    const start = performance.now()
    const a = from.current
    let frame = 0
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / duration)
      const v = a + (value - a) * ease(k)
      from.current = v
      setShown(k < 1 ? v : value)
      if (k < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, duration, instant])

  return shown
}

/** false на первом кадре, потом true — шкалы и полоски «дорастают» до значения (без анимации — сразу true) */
export function useShown(): boolean {
  const [shown, setShown] = useState(prefersReducedMotion)
  useEffect(() => {
    if (shown) return
    const f = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
    return () => cancelAnimationFrame(f)
  }, [shown])
  return shown
}

/**
 * №2 3D-наклон карточки к курсору (только главная): не больше ±max°, перспектива 800px, блик (--sx / --sy для .tilt-sheen),
 * при уходе курсора — плавный возврат (.tilt в theme.css). Только мышь и без «уменьшить движение».
 */
export function useTilt(ref: RefObject<HTMLElement | null>, max = 7) {
  useEffect(() => {
    const el = ref.current
    if (!el || prefersReducedMotion() || !hasFinePointer()) return
    let frame = 0
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect()
        const x = e.clientX - r.left
        const y = e.clientY - r.top
        const px = x / r.width - 0.5
        const py = y / r.height - 0.5
        el.dataset.active = ''
        el.style.transform = `perspective(800px) rotateX(${(-py * 2 * max).toFixed(2)}deg) rotateY(${(px * 2 * max).toFixed(2)}deg)`
        el.style.setProperty('--sx', `${x}px`)
        el.style.setProperty('--sy', `${y}px`)
      })
    }
    const leave = () => {
      cancelAnimationFrame(frame)
      delete el.dataset.active
      el.style.transform = ''
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerleave', leave)
    return () => {
      cancelAnimationFrame(frame)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerleave', leave)
    }
  }, [ref, max])
}

/**
 * №3 Подсветка под курсором: на движение мыши в контейнере каждой карточке [data-spot] ставятся --x / --y
 * (координаты курсора относительно этой карточки) — мягкое пятно внутри и рамка ярче ближе к курсору (.spot-frame в theme.css).
 */
export function useSpotlight(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const box = ref.current
    if (!box || prefersReducedMotion() || !hasFinePointer()) return
    let frame = 0
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        for (const el of box.querySelectorAll<HTMLElement>('[data-spot]')) {
          const r = el.getBoundingClientRect()
          el.style.setProperty('--x', `${e.clientX - r.left}px`)
          el.style.setProperty('--y', `${e.clientY - r.top}px`)
        }
      })
    }
    const leave = () => {
      cancelAnimationFrame(frame)
      for (const el of box.querySelectorAll<HTMLElement>('[data-spot]')) {
        el.style.removeProperty('--x')
        el.style.removeProperty('--y')
      }
    }
    box.addEventListener('pointermove', move)
    box.addEventListener('pointerleave', leave)
    return () => {
      cancelAnimationFrame(frame)
      box.removeEventListener('pointermove', move)
      box.removeEventListener('pointerleave', leave)
    }
  }, [ref])
}

/** Счётчик-ключ: растёт при каждом вызове bump() — чтобы перезапустить CSS-анимацию (key={n}), например «мотание головой» формы */
export function useReplay(): [number, () => void] {
  const [n, setN] = useState(0)
  return [n, () => setN((x) => x + 1)]
}
