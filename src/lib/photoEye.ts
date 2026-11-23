/**
 * Глаз «как на фото» — центр «Воронки» на главной (владелец 23.11.2026: «вечно меняющиеся символы выглядят дёшево»,
 * «сделай как на фотке, но маленьким»; выбран оранжевый; «чтобы менялись все символы, но медленно»).
 * Как на образце: вся плитка — текст; символ клетки выбирается по её яркости из «лестницы плотности»
 * (тонкие : i j f — тёмное, плотные # W @ — светлое), цвет — из картинки глаза (кожа, белок, оранжевая радужка, чёрный зрачок).
 * Символы меняются МЕДЛЕННО: у каждой клетки своя фаза, раз в ~2,5 с она берёт соседний по плотности символ —
 * картинка не мельтешит, но «дышит». Живость — от самого глаза: взгляд на пружинке, моргание, зрачок дышит и расширяется.
 * Только расчёт и рисование на canvas; сцена и цикл кадров — components/fx/ExchangeVortex.tsx.
 */
import { smooth as sm, type Rgb } from '@/lib/asciiEye'

export type PhotoEyeColors = {
  bg: Rgb
  core: Rgb
  iris: Rgb
  edge: Rgb
  skin: Rgb
  sclera: Rgb
  dim: Rgb
  glow: Rgb
  pupil: Rgb
}

/** Лестница плотности: пробел — пусто, дальше всё плотнее */
const RAMP = ' .:;ijftrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$'
const HALF = 1.42 // половина ширины глаза (в половинах высоты)
const IRIS = 0.6
/** Как часто клетка меняет символ: раз в столько секунд (в среднем) */
export const PHOTO_EYE_CHANGE_S = 2.5

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const rgba = (c: Rgb, a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`
const hash = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}

export class PhotoEye {
  private w = 0
  private h = 0
  private cw = 0
  private ch = 0
  private cols = 0
  private rows = 0
  private scale = 0.86
  private phase = new Float32Array(0)
  /** состояние взгляда и век (читается в тестах) */
  readonly s = { tx: 0, ty: 0, gx: 0, gy: 0, vx: 0, vy: 0, open: 1, blink: -1, nextBlink: 2.6, pupil: 0.26, pv: 0, dil: 0, t: 0, nextLook: 1 }

  constructor(
    private ctx: CanvasRenderingContext2D,
    public colors: PhotoEyeColors,
    private font: string,
  ) {}

  /** Размер плитки в CSS-пикселях: шрифт — от ширины, чтобы на любом экране было ~30–36 столбцов */
  resize(w: number, h: number) {
    this.w = w
    this.h = h
    // узкая плитка (телефон) — символы крупнее, иначе превращаются в шум
    const fontPx = Math.max(3, w / (w < 140 ? 30 : 36))
    this.ctx.font = `700 ${fontPx}px ${this.font}`
    this.ctx.textBaseline = 'top'
    this.cw = this.ctx.measureText('M').width || fontPx * 0.6
    this.ch = fontPx
    this.cols = Math.max(8, Math.floor(w / this.cw))
    this.rows = Math.max(6, Math.floor(h / this.ch))
    const asp = this.asp()
    this.scale = Math.min(0.86, asp / (HALF * 1.12))
    this.phase = new Float32Array(this.cols * this.rows).map((_, i) => hash(i % this.cols, Math.floor(i / this.cols)) * PHOTO_EYE_CHANGE_S)
  }

  get size() {
    return { cols: this.cols, rows: this.rows }
  }

  /** Сделка влетела: зрачок расширяется */
  dilate() {
    this.s.dil = 1
  }

  /** Моргнуть */
  blink() {
    this.s.blink = 0
  }

  private asp() {
    return (this.cw / this.ch) * (this.cols / this.rows)
  }
  private toX(col: number) {
    return ((((col + 0.5) / this.cols) * 2 - 1) * this.asp()) / this.scale
  }
  private toY(row: number) {
    return (1 - ((row + 0.5) / this.rows) * 2) / this.scale
  }
  private colOf(x: number) {
    return (((x * this.scale) / this.asp() + 1) / 2) * this.cols - 0.5
  }
  private rowOf(y: number) {
    return ((1 - y * this.scale) / 2) * this.rows - 0.5
  }

  /** Символ клетки: по яркости, с медленной сменой на соседний по плотности */
  glyph(col: number, row: number, b: number): string {
    const n = RAMP.length - 1
    const base = Math.round(Math.min(1, Math.max(0, b)) * n)
    const i = row * this.cols + col
    const step = Math.floor((this.s.t + (this.phase[i] || 0)) / PHOTO_EYE_CHANGE_S)
    // соседний символ (−1, 0, +1) — выбирается по номеру «шага», у каждой клетки свой момент смены
    const shift = Math.floor(hash(i, step) * 3) - 1
    return RAMP[Math.max(base > 0 ? 1 : 0, Math.min(n, base + (base > 0 ? shift : 0)))]
  }

  /**
   * Шаг: gaze — куда смотреть (в половинах размера плитки; null — сам смотрит по сторонам).
   */
  step(dt: number, gaze: { x: number; y: number } | null) {
    const s = this.s
    const t = (s.t += dt)
    if (gaze) {
      s.tx = (gaze.x * this.asp()) / this.scale
      s.ty = gaze.y / this.scale
    } else if (t > s.nextLook) {
      s.tx = (Math.random() - 0.5) * 1.6
      s.ty = (Math.random() - 0.45) * 0.8
      s.nextLook = t + 1.4 + Math.random() * 2.6
    }
    const len = Math.hypot(s.tx, s.ty * 1.6) || 1
    const k = Math.min(1, 0.36 / (len * 0.55))
    s.vx += ((s.tx * 0.55 * k - s.gx) * 110 - s.vx * 15) * dt
    s.vy += ((s.ty * 0.34 * k - s.gy) * 110 - s.vy * 15) * dt
    s.gx += s.vx * dt
    s.gy += s.vy * dt
    if (s.blink < 0 && t > s.nextBlink) s.blink = 0
    if (s.blink >= 0) {
      s.blink += dt / 0.26
      const b = Math.min(1, s.blink)
      s.open = 1 - (b < 0.4 ? sm(0, 0.4, b) : 1 - sm(0.4, 1, b))
      if (s.blink >= 1) {
        s.blink = -1
        s.open = 1
        s.nextBlink = t + 3 + Math.random() * 3.5
      }
    }
    s.dil = Math.max(0, s.dil - dt * 1.1)
    const aim = 0.25 + Math.sin(t * 1.3) * 0.012 + s.dil * 0.07
    s.pv += ((aim - s.pupil) * 60 - s.pv * 9) * dt
    s.pupil += s.pv * dt
  }

  draw() {
    const { ctx, cols, rows, cw, ch, s, colors: c } = this
    const W = this.w
    const H = this.h
    if (!W || !H) return
    const E = this.scale
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = rgba(c.bg, 1)
    ctx.fillRect(0, 0, W, H)
    ctx.save()
    ctx.translate((W - cols * cw) / 2, (H - rows * ch) / 2)
    const hh = (rows * ch) / 2
    const ix = (this.colOf(s.gx) + 0.5) * cw
    const iy = (this.rowOf(s.gy) + 0.5) * ch
    // мягкое свечение за радужкой и чёрный зрачок
    const R = IRIS * E * hh
    const g = ctx.createRadialGradient(ix, iy, R * 0.2, ix, iy, R * 2.3)
    g.addColorStop(0, rgba(c.glow, 0.22 * s.open))
    g.addColorStop(0.5, rgba(c.glow, 0.07 * s.open))
    g.addColorStop(1, rgba(c.glow, 0))
    ctx.fillStyle = g
    ctx.fillRect(-W, -H, W * 3, H * 3)
    ctx.fillStyle = rgba(c.pupil, 1)
    ctx.beginPath()
    ctx.ellipse(ix, iy, s.pupil * E * hh * 1.02, s.pupil * E * hh * 1.02 * s.open, 0, 0, Math.PI * 2)
    ctx.fill()

    const buckets = new Map<string, number[]>()
    const glyphs: string[] = []
    const put = (col: number, row: number, glyph: string, color: Rgb, a: number) => {
      if (a <= 0.02) return
      const q = (v: number) => Math.round(v / 8) * 8
      const key = `${q(color[0])},${q(color[1])},${q(color[2])},${Math.round(Math.min(1, a) * 20) / 20}`
      let arr = buckets.get(key)
      if (!arr) buckets.set(key, (arr = []))
      arr.push(col, row, glyphs.push(glyph) - 1)
    }
    for (let row = 0; row < rows; row++) {
      const y = this.toY(row)
      for (let col = 0; col < cols; col++) {
        const x = this.toX(col)
        const kk = Math.max(0, 1 - (x / HALF) ** 2)
        const botLid = -0.58 * Math.pow(kk, 1.05)
        const openTop = 0.8 * Math.pow(kk, 1.05)
        const topLid = openTop * s.open + (1 - s.open) * botLid
        const inside = sm(-0.035, 0.035, topLid - y) * sm(-0.035, 0.035, y - botLid) * (Math.abs(x) < HALF ? 1 : 0)
        let b: number
        let rgb: Rgb
        let iris = false
        if (inside < 0.5) {
          // кожа: к глазу светлее, складка века над ним, ресничный край
          const dEye = Math.hypot(x / 1.75, (y + 0.05) / 1.15)
          b = 0.05 + 0.24 * sm(1.55, 0.75, dEye) + 0.05 * hash(col, row)
          const crease = Math.abs(y - (openTop + 0.2 * Math.pow(kk, 0.6) + 0.05)) < 0.03 && Math.abs(x) < HALF * 0.92
          const lidLine = Math.abs(y - topLid) < 0.05 || Math.abs(y - botLid) < 0.04
          if (lidLine && Math.abs(x) < HALF) b = 0.9
          else if (crease) b = 0.5
          rgb = mix(c.dim, c.skin, sm(1.6, 0.8, dEye) * 0.6)
        } else {
          const dx = x - s.gx
          const dy = y - s.gy
          const d = Math.hypot(dx, dy)
          if (d < s.pupil) continue
          if (d < IRIS) {
            const ang = Math.atan2(dy, dx)
            const r01 = (d - s.pupil) / (IRIS - s.pupil)
            const fib = 0.5 + 0.5 * Math.sin(ang * 34 + s.t * 0.12 + Math.sin(ang * 5 - s.t * 0.25) * 1.6 + d * 12)
            b = 0.5 + 0.38 * fib + 0.25 * sm(0.28, 0.08, r01) - 0.55 * sm(0.8, 1, r01)
            rgb = r01 < 0.45 ? mix(c.core, c.iris, sm(0, 0.45, r01)) : mix(c.iris, c.edge, sm(0.45, 1, r01))
            rgb = mix(rgb, c.core, fib * 0.12)
            iris = true
          } else {
            const lidShade = 0.55 + 0.45 * sm(0, 0.16, topLid - y)
            const corner = 1 - sm(0.95, HALF, Math.abs(x)) * 0.55
            b = 0.38 + 0.58 * lidShade * corner - 0.22 * sm(IRIS + 0.14, IRIS, d)
            rgb = mix(c.dim, c.sclera, 0.62 + lidShade * 0.38)
          }
          // блик — светлое пятно над зрачком
          if (Math.hypot(x - (s.gx - 0.17), y - (s.gy + 0.17)) < 0.095) {
            put(col, row, '@', c.sclera, 1)
            continue
          }
          b *= inside
        }
        const glyph = this.glyph(col, row, b)
        if (glyph === ' ') continue
        put(col, row, glyph, rgb, iris ? 0.5 + b * 0.6 : 0.22 + b * 0.92)
      }
    }
    for (const [key, arr] of buckets) {
      const [r, gg, bb, a] = key.split(',').map(Number)
      ctx.fillStyle = `rgba(${r},${gg},${bb},${a})`
      for (let i = 0; i < arr.length; i += 3) ctx.fillText(glyphs[arr[i + 2]], arr[i] * cw, arr[i + 1] * ch)
    }
    ctx.restore()
    // мягкая виньетка к краям плитки
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7)
    v.addColorStop(0, rgba(c.bg, 0))
    v.addColorStop(1, rgba(c.bg, 0.85))
    ctx.fillStyle = v
    ctx.fillRect(0, 0, W, H)
  }
}
