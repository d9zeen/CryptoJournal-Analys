/**
 * Фон первого экрана: живой свечной график, который бесконечно «едет»: справа рождаются новые свечи,
 * последняя свеча формируется на глазах, старые уезжают влево и растворяются.
 * Рисуется на <canvas> (requestAnimationFrame), цвета — из theme.css (--color-up / --color-down / --color-bg),
 * при смене темы или палитры перечитываются. Без сетки; тела свечей непрозрачные (фитиль не просвечивает). Стоит на паузе, когда блок не виден или вкладка скрыта.
 * «Уменьшить движение» — один неподвижный кадр.
 */
import { useEffect, useRef, type CSSProperties } from 'react'
import { prefersReducedMotion } from '@/lib/motion'

type Candle = { o: number; h: number; l: number; c: number }

const STEP = 18 // px между свечами
const BODY = 9 // ширина тела свечи
const SPEED = 22 // px в секунду
/** Прозрачность свечей по темам: на светлом фоне свечи плотнее, иначе выглядят блёклыми */
const DARK = { wick: 0.6, up: 0.45, down: 0.5 }
const LIGHT = { wick: 0.8, up: 0.75, down: 0.7 }
const RIGHT = 28 // отступ новой свечи от правого края, px

/** Следующая свеча: случайное блуждание с лёгким ростом и возвратом к середине, чтобы график не улетал */
function nextCandle(prev: number, rnd: () => number): Candle {
  const drift = 0.06 + (50 - prev) * 0.015
  const move = (rnd() - 0.5) * 6 + drift
  const o = prev
  const c = prev + move
  const h = Math.max(o, c) + rnd() * 2.2
  const l = Math.min(o, c) - rnd() * 2.2
  return { o, h, l, c }
}

/**
 * Цвета свечей — свои токены theme.css (--hero-up / --hero-down, прозрачности --hero-*-a, --hero-hollow-up: 1 — растущие свечи пустые, только контур).
 * Если токена нет — цвета палитры прибыли / убытка и прозрачности по умолчанию (DARK / LIGHT).
 */
function readColors() {
  const s = getComputedStyle(document.documentElement)
  const v = (n: string) => s.getPropertyValue(n).trim()
  const light = document.documentElement.dataset.theme === 'light'
  const base = light ? LIGHT : DARK
  const num = (n: string, d: number) => {
    const x = parseFloat(v(n))
    return Number.isFinite(x) ? x : d
  }
  return {
    up: v('--hero-up') || v('--color-up'),
    down: v('--hero-down') || v('--color-down'),
    bg: v('--color-bg'),
    light,
    alpha: { wick: num('--hero-wick-a', base.wick), up: num('--hero-up-a', base.up), down: num('--hero-down-a', base.down) },
    hollowUp: v('--hero-hollow-up') === '1',
  }
}

export function HeroCandles({ className = '', style }: { className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const rnd = Math.random
    let colors = readColors()
    let w = 0
    let h = 0
    let candles: Candle[] = []
    let shift = 0 // сдвиг влево внутри одного шага, px
    let lo = 0
    let hi = 100
    let live = 0 // 0…1 — насколько «сформирована» последняя свеча
    let target: Candle = { o: 50, h: 50, l: 50, c: 50 }

    const fill = () => {
      const need = Math.ceil(w / STEP) + 3
      if (!candles.length) {
        let p = 40 + rnd() * 10
        for (let i = 0; i < need; i++) {
          const c = nextCandle(p, rnd)
          candles.push(c)
          p = c.c
        }
        const r = range()
        lo = r[0]
        hi = r[1]
      }
      while (candles.length < need) candles.unshift(nextCandle(candles[0]?.o ?? 50, rnd))
      target = nextCandle(candles[candles.length - 1].c, rnd)
    }

    const range = (): [number, number] => {
      let a = Infinity
      let b = -Infinity
      for (const c of candles) {
        a = Math.min(a, c.l)
        b = Math.max(b, c.h)
      }
      const pad = (b - a) * 0.15 + 1
      return [a - pad, b + pad]
    }

    const resize = () => {
      const r = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = r.width
      h = r.height
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      fill()
      draw()
    }

    const y = (v: number) => h - ((v - lo) / (hi - lo)) * h

    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      // без сетки (решение владельца 08.11.2026): только свечи

      // последняя свеча формируется: от открытия к цели
      const k = live
      const forming: Candle = {
        o: target.o,
        c: target.o + (target.c - target.o) * k,
        h: Math.max(target.o, target.o + (target.h - target.o) * k),
        l: Math.min(target.o, target.o + (target.l - target.o) * k),
      }
      const all = [...candles, forming]
      // формирующаяся свеча рождается у правого края и вместе со всеми плавно уезжает влево
      const x0 = w - RIGHT - (all.length - 1) * STEP - shift

      all.forEach((c, i) => {
        const x = x0 + i * STEP
        if (x < -STEP || x > w + STEP) return
        const up = c.c >= c.o
        const a = colors.alpha
        ctx.globalAlpha = a.wick
        ctx.strokeStyle = up ? colors.up : colors.down
        ctx.fillStyle = up ? colors.up : colors.down
        ctx.lineWidth = colors.light ? 1.25 : 1
        ctx.beginPath()
        ctx.moveTo(Math.round(x) + 0.5, y(c.h))
        ctx.lineTo(Math.round(x) + 0.5, y(c.l))
        ctx.stroke()
        const top = y(Math.max(c.o, c.c))
        const bh = Math.max(2, Math.abs(y(c.o) - y(c.c)))
        // тело непрозрачное: сначала закрываем фитиль цветом фона, потом красим полупрозрачным цветом свечи —
        // фитиль не просвечивает сквозь тело
        const bx = Math.round(x - BODY / 2)
        ctx.globalAlpha = 1
        ctx.fillStyle = colors.bg
        ctx.beginPath()
        ctx.roundRect(bx, top, BODY, bh, 1.5)
        ctx.fill()
        ctx.globalAlpha = up ? a.up : a.down
        ctx.fillStyle = up ? colors.up : colors.down
        ctx.beginPath()
        if (up && colors.hollowUp) {
          // «пустая» растущая свеча, как в классических графиках: только контур
          ctx.roundRect(bx + 0.5, top + 0.5, BODY - 1, Math.max(1, bh - 1), 1.5)
          ctx.stroke()
        } else {
          ctx.roundRect(bx, top, BODY, bh, 1.5)
          ctx.fill()
        }
      })

      ctx.globalAlpha = 1
    }

    let frame = 0
    let prev = 0
    let running = false
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000)
      prev = now
      shift += SPEED * dt
      live = Math.min(1, shift / STEP)
      if (shift >= STEP) {
        shift -= STEP
        candles.push(target)
        candles.shift()
        target = nextCandle(target.c, rnd)
        live = shift / STEP
      }
      // масштаб по высоте подстраивается плавно, без рывков
      const [a, b] = range()
      lo += (Math.min(a, target.l) - lo) * 0.03
      hi += (Math.max(b, target.h) - hi) * 0.03
      draw()
      frame = requestAnimationFrame(tick)
    }
    const start = () => {
      if (running || prefersReducedMotion()) return
      running = true
      prev = performance.now()
      frame = requestAnimationFrame(tick)
    }
    const stop = () => {
      running = false
      cancelAnimationFrame(frame)
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    let visible = true
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      if (visible && !document.hidden) start()
      else stop()
    })
    io.observe(canvas)
    const onVis = () => (document.hidden || !visible ? stop() : start())
    document.addEventListener('visibilitychange', onVis)
    // тема / палитра поменялись — перечитать цвета
    const mo = new MutationObserver(() => {
      colors = readColors()
      if (!running) draw()
    })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette'] })

    return () => {
      stop()
      ro.disconnect()
      io.disconnect()
      mo.disconnect()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  return <canvas ref={ref} aria-hidden className={className} style={style} />
}
