/**
 * «Сделки собирают кривую» (17.11.2026, вариант S3; образцы 21st.dev particles, particle-text-effect):
 * из логотипа биржи, откуда пришла сделка, по дуге вылетают частицы и садятся на свои места, собирая кривую капитала;
 * за ними слева направо тянется плавная фиолетовая линия с заливкой через каждую точку (monotone, как кривая капитала «Статистики»).
 * Владелец 17.11.2026: собирается ОДИН раз и дальше стоит; заново — при новом заходе на страницу (новый компонент)
 * и когда пришли новые сделки (values поменялись), но только если вкладку видно; вкладка в фоне или «уменьшить движение» — сразу готовая кривая.
 * Темп — «медленнее и постепенно». Canvas (как свечи главной), цвета — токены theme.css.
 */
import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from '@/lib/motion'

// темп — «медленнее и постепенно»: точка каждые 220 мс, полёт 1,8 с; но вся сборка не дольше ~8 с (500 сделок за неделю — не 2 минуты),
// и частиц не больше ~600 (на точку — от 8 до 1)
const MAX_STEP = 220 // мс между точками кривой
const MAX_BUILD = 6500 // мс на все точки
const MAX_PARTS = 600
const FLY = 1800 // мс полёта частицы
const TOP = 92 // место сверху под итог

/**
 * Плавная линия ЧЕРЕЗ каждую точку без выбросов за пределы соседних значений (monotone cubic, Fritsch–Carlson) —
 * как type="monotone" у кривой капитала (Recharts): вершины не срезаются, а при 2–3 сделках линия не врёт.
 */
export function monotonePath(pts: [number, number][]): Path2D {
  const p = new Path2D()
  const n = pts.length
  p.moveTo(pts[0][0], pts[0][1])
  if (n === 2) {
    p.lineTo(pts[1][0], pts[1][1])
    return p
  }
  const dx: number[] = []
  const m: number[] = []
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0])
    m.push((pts[i + 1][1] - pts[i][1]) / (dx[i] || 1))
  }
  const tan: number[] = [m[0]]
  for (let i = 1; i < n - 1; i++) tan.push(m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]))
  tan.push(m[n - 2])
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3
    p.bezierCurveTo(pts[i][0] + h, pts[i][1] + tan[i] * h, pts[i + 1][0] - h, pts[i + 1][1] - tan[i + 1] * h, pts[i + 1][0], pts[i + 1][1])
  }
  return p
}

/** values — накопленный результат по сделкам; source(i) — логотип биржи, откуда летят частицы точки i (у каждой сделки — своя биржа); onLanded — сколько точек уже на месте */
export function ParticleCurve({ values, source, left, onLanded, className = '' }: { values: number[]; source: (i: number) => HTMLElement | null; left: number; onLanded?: (n: number) => void; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx || values.length < 2) return
    const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim()
    // анимация — только если человек это видит
    let done = prefersReducedMotion() || document.hidden
    let W = 0
    let H = 0
    let pts: [number, number][] = []
    let parts: { sx: number; sy: number; cx: number; cy: number; tx: number; ty: number; d: number }[] = []
    const t0 = performance.now()
    let raf = 0
    let landedShown = -1
    const n = values.length
    const STEP = Math.min(MAX_STEP, MAX_BUILD / Math.max(1, n - 1))
    const PER_POINT = Math.max(1, Math.min(8, Math.round(MAX_PARTS / n)))
    const total = (n - 1) * STEP + FLY + PER_POINT * 25

    const build = () => {
      const dpr = window.devicePixelRatio || 1
      W = cv.clientWidth
      H = cv.clientHeight
      cv.width = W * dpr
      cv.height = H * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const lo = Math.min(...values)
      const hi = Math.max(...values)
      const x0 = Math.min(W * 0.5, left + 40)
      const x1 = W - 24
      const bottom = H - 28
      pts = values.map((v, i) => [x0 + (i / (n - 1)) * (x1 - x0), bottom - ((v - lo) / (hi - lo || 1)) * (bottom - TOP)])
      const box = cv.getBoundingClientRect()
      const at = new Map<HTMLElement | null, [number, number]>()
      const from = (i: number): [number, number] => {
        const el = source(i)
        if (!at.has(el)) {
          const r = el?.getBoundingClientRect()
          at.set(el, r ? [r.left - box.left + r.width / 2, r.top - box.top + r.height / 2] : [20, H / 2])
        }
        return at.get(el)!
      }
      let seed = 7
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
      parts = []
      pts.forEach(([x, y], i) => {
        const [sx, sy] = from(i)
        for (let k = 0; k < PER_POINT; k++)
          parts.push({ sx, sy, tx: x + (rnd() - 0.5) * 4, ty: y + (rnd() - 0.5) * 4, d: i * STEP + k * 25, cx: (sx + x) / 2 + (rnd() - 0.5) * 80, cy: Math.min(sy, y) - 50 - rnd() * 60 })
      })
    }
    const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)

    const draw = (now: number) => {
      const t = done ? Infinity : now - t0
      ctx.clearRect(0, 0, W, H)
      const primary = css('--color-primary')
      const accent = css('--color-accent')
      // линия вытягивается слева направо плавно (обрезка по x), вслед за севшими частицами
      const progress = n < 2 ? 0 : Math.min(1, Math.max(0, (t - FLY) / (STEP * (n - 1))))
      const landed = t < FLY ? 0 : Math.min(n, Math.floor(progress * (n - 1)) + 1)
      if (progress > 0) {
        const line = monotonePath(pts)
        const area = new Path2D(line)
        area.lineTo(pts[n - 1][0], H)
        area.lineTo(pts[0][0], H)
        area.closePath()
        const reveal = pts[0][0] + progress * (pts[n - 1][0] - pts[0][0])
        ctx.save()
        ctx.beginPath()
        ctx.rect(0, 0, reveal + 1, H)
        ctx.clip()
        const g = ctx.createLinearGradient(0, TOP, 0, H)
        g.addColorStop(0, primary)
        g.addColorStop(1, 'transparent')
        ctx.globalAlpha = 0.18
        ctx.fillStyle = g
        ctx.fill(area)
        ctx.globalAlpha = 0.95
        ctx.strokeStyle = primary
        ctx.lineWidth = 2
        ctx.lineJoin = 'round'
        ctx.stroke(line)
        ctx.restore()
      }
      // частицы в полёте; севшие — тихие точки сделок на кривой
      for (const p of parts) {
        const k = done ? 1 : Math.min(1, Math.max(0, (t - p.d) / FLY))
        if (k <= 0) continue
        const e = ease(k)
        const a = 1 - e
        const x = a * a * p.sx + 2 * a * e * p.cx + e * e * p.tx
        const y = a * a * p.sy + 2 * a * e * p.cy + e * e * p.ty
        ctx.fillStyle = k < 1 ? accent : primary
        ctx.globalAlpha = k < 1 ? 0.95 : 0.35
        ctx.beginPath()
        ctx.arc(x, y, k < 1 ? 2.2 : 1.2, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      // точка на конце, когда кривая собралась
      if (landed === n) {
        const [x, y] = pts[n - 1]
        ctx.fillStyle = primary
        ctx.beginPath()
        ctx.arc(x, y, 4.5, 0, Math.PI * 2)
        ctx.fill()
      }
      if (landed !== landedShown) {
        landedShown = landed
        onLanded?.(landed)
      }
      if (t >= total) done = true
      // собралась — кадров больше не рисуем, кривая просто стоит
      if (!done) raf = requestAnimationFrame(draw)
    }

    build()
    raf = requestAnimationFrame(draw)
    // смена размера — перестраиваем; если уже собралась — сразу готовой, без повторной анимации
    const ro = new ResizeObserver(() => {
      build()
      if (done) draw(performance.now())
    })
    ro.observe(cv)
    // смена темы / палитры после сборки — перерисовать готовую кривую новыми цветами (кадры уже не идут)
    const mo = new MutationObserver(() => {
      if (done) draw(performance.now())
    })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette'] })
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      mo.disconnect()
    }
  }, [values, source, left, onLanded])
  return <canvas ref={ref} aria-hidden className={`block size-full ${className}`} />
}
