/**
 * «Сделки собирают кривую» (17.11.2026, вариант S3; образцы 21st.dev particles, particle-text-effect):
 * из логотипа подключённой биржи по дуге вылетают частицы-сделки и садятся на свои места, собирая кривую капитала;
 * за ними тянется фиолетовая линия. Собралась — постояла, тихо погасла и собирается снова. Canvas (как свечи главной), цвета — токены theme.css.
 * «Уменьшить движение» — сразу готовая кривая.
 */
import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from '@/lib/motion'

const PER_POINT = 8
// владелец 17.11.2026: «медленнее и постепенно» — точка каждые 220 мс, полёт 1,8 с, готовая кривая стоит 5 с, гаснет 1,5 с
const STEP = 220 // мс между точками кривой
const FLY = 1800 // мс полёта частицы
const HOLD = 5000
const FADE = 1500

/** values — накопленный результат по сделкам; source — элемент-логотип, откуда летят частицы; onLanded — сколько точек уже на месте */
export function ParticleCurve({ values, source, left, onLanded, className = '' }: { values: number[]; source: () => HTMLElement | null; left: number; onLanded?: (n: number) => void; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx || values.length < 2) return
    const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim()
    const reduce = prefersReducedMotion()
    let W = 0
    let H = 0
    let pts: [number, number][] = []
    let parts: { sx: number; sy: number; cx: number; cy: number; tx: number; ty: number; d: number }[] = []
    let t0 = 0
    let raf = 0
    let landedShown = -1
    let seed = 7
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
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
      const top = 92
      const bottom = H - 28
      pts = values.map((v, i) => [x0 + (i / (values.length - 1)) * (x1 - x0), bottom - ((v - lo) / (hi - lo || 1)) * (bottom - top)])
      const src = source()?.getBoundingClientRect()
      const box = cv.getBoundingClientRect()
      const sx = src ? src.left - box.left + src.width / 2 : 20
      const sy = src ? src.top - box.top + src.height / 2 : H / 2
      seed = 7
      parts = []
      pts.forEach(([x, y], i) => {
        for (let k = 0; k < PER_POINT; k++)
          parts.push({ sx, sy, tx: x + (rnd() - 0.5) * 4, ty: y + (rnd() - 0.5) * 4, d: i * STEP + k * 25, cx: (sx + x) / 2 + (rnd() - 0.5) * 80, cy: Math.min(sy, y) - 50 - rnd() * 60 })
      })
      t0 = performance.now()
    }
    const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
    const frame = (now: number) => {
      const t = reduce ? 1e9 : now - t0
      ctx.clearRect(0, 0, W, H)
      const primary = css('--color-primary')
      const accent = css('--color-accent')
      const total = values.length * STEP + FLY
      const fade = t > total + HOLD ? Math.min(1, (t - total - HOLD) / FADE) : 0
      // линия вытягивается слева направо плавно (обрезка по x), вслед за севшими частицами
      const n = pts.length
      const progress = Math.min(1, Math.max(0, (t - FLY) / (STEP * (n - 1))))
      const landed = t < FLY ? 0 : Math.min(n, Math.floor(progress * (n - 1)) + 1)
      if (progress > 0) {
        // плавная линия через середины отрезков (как кривая капитала «Статистики») + мягкая заливка под ней
        const line = new Path2D()
        line.moveTo(pts[0][0], pts[0][1])
        for (let i = 1; i < n - 1; i++) line.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2)
        line.lineTo(pts[n - 1][0], pts[n - 1][1])
        const area = new Path2D(line)
        area.lineTo(pts[n - 1][0], H)
        area.lineTo(pts[0][0], H)
        area.closePath()
        const reveal = pts[0][0] + progress * (pts[n - 1][0] - pts[0][0])
        ctx.save()
        ctx.beginPath()
        ctx.rect(0, 0, reveal + 1, H)
        ctx.clip()
        const g = ctx.createLinearGradient(0, 92, 0, H)
        g.addColorStop(0, primary)
        g.addColorStop(1, 'transparent')
        ctx.globalAlpha = 0.18 * (1 - fade)
        ctx.fillStyle = g
        ctx.fill(area)
        ctx.globalAlpha = 0.95 * (1 - fade)
        ctx.strokeStyle = primary
        ctx.lineWidth = 2
        ctx.lineJoin = 'round'
        ctx.stroke(line)
        ctx.restore()
      }
      for (const p of parts) {
        const k = Math.min(1, Math.max(0, (t - p.d) / FLY))
        if (k <= 0) continue
        const e = ease(k)
        const a = 1 - e
        const x = a * a * p.sx + 2 * a * e * p.cx + e * e * p.tx
        const y = a * a * p.sy + 2 * a * e * p.cy + e * e * p.ty
        ctx.fillStyle = k < 1 ? accent : primary
        ctx.globalAlpha = (k < 1 ? 0.95 : 0.35) * (1 - fade)
        ctx.beginPath()
        ctx.arc(x, y, k < 1 ? 2.2 : 1.2, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      // точка на конце, когда кривая собралась
      if (landed === pts.length) {
        const [x, y] = pts[pts.length - 1]
        ctx.globalAlpha = 1 - fade
        ctx.fillStyle = primary
        ctx.beginPath()
        ctx.arc(x, y, 4.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }
      if (landed !== landedShown) {
        landedShown = landed
        onLanded?.(landed)
      }
      if (fade >= 1) build()
      if (!reduce) raf = requestAnimationFrame(frame)
    }
    build()
    raf = requestAnimationFrame(frame)
    const ro = new ResizeObserver(build)
    ro.observe(cv)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [values, source, left, onLanded])
  return <canvas ref={ref} aria-hidden className={`block size-full ${className}`} />
}
