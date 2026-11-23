/**
 * Живой глаз из символов кода — движок логотипа (22.11.2026, владелец: «глаз как идёт кодом, живой», вариант A).
 * Глаз считается по клеткам сетки: веки миндалём, белок с тенью под веком, радужка (центр → цвет → тёмный край, волокна медленно вращаются),
 * чёрный зрачок, блик. Каждая клетка — символ, строки «текут» как прокрутка кода, по столбцам сверху вниз пробегает светлый «дождь».
 * Взгляд — на пружинке за курсором (направление на курсор, где бы он ни был), моргание, прищур рядом с курсором, зрачок «дышит»,
 * нажатие — моргнул и расширил зрачок; без движения мыши засыпает (веко закрыто), от движения просыпается.
 * Здесь только расчёт и рисование на canvas; события, размеры и цикл кадров — components/EyeMark.tsx.
 */

export type Rgb = [number, number, number]

export type EyeColors = {
  sclera: Rgb
  irisCore: Rgb
  iris: Rgb
  irisEdge: Rgb
  lid: Rgb
  pupil: Rgb
  glow: Rgb
  glint: Rgb
  tile: Rgb
}

/** «#rrggbb» / «#rgb» → [r, g, b]; что-то другое — null */
export function parseHex(value: string): Rgb | null {
  const v = value.trim()
  const m6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(v)
  if (m6) return [parseInt(m6[1], 16), parseInt(m6[2], 16), parseInt(m6[3], 16)]
  const m3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(v)
  if (m3) return [parseInt(m3[1] + m3[1], 16), parseInt(m3[2] + m3[2], 16), parseInt(m3[3] + m3[3], 16)]
  return null
}

const DENSE = '0123456789$#&@%8BWMQXabdk'
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const rgba = (c: Rgb, a: number) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`

/** Где курсор относительно глаза: dx, dy — в размерах глаза (центр 0, край плитки ±1); null — мыши нет */
export type Gaze = { dx: number; dy: number } | null

/** Половина ширины глаза (в половинах высоты), радиус радужки, высота век: глаз круглее обычного миндаля — квадратную плитку заполняет лучше */
const HALF = 1.24
const IRIS = 0.6
const TOP = 0.9
const BOT = 0.68

export class AsciiEye {
  private cols = 0
  private rows = 0
  private cw = 0
  private ch = 0
  private size = 0
  private scale = 0.65
  private jitter = new Float32Array(0)
  private rowSpeed: number[] = []
  private rain: { v: number; p: number; len: number }[] = []
  // состояние: взгляд (цель, положение, скорость), веки, прищур, зрачок, сон
  private s = {
    tx: 0,
    ty: 0,
    gx: 0,
    gy: 0,
    vx: 0,
    vy: 0,
    open: 1,
    blink: -1,
    nextBlink: 2.4,
    squint: 0,
    pupil: 0.26,
    pupilV: 0,
    dil: 0,
    nextLook: 1,
    t: 0,
    wake: 0,
  }

  constructor(
    private ctx: CanvasRenderingContext2D,
    public colors: EyeColors,
    private font: string,
  ) {}

  /** Новый размер плитки (CSS-пиксели): пересчитать сетку символов */
  resize(size: number) {
    this.size = size
    const fontPx = Math.max(2.4, size * 0.1)
    this.ctx.font = `800 ${fontPx}px ${this.font}`
    this.cw = this.ctx.measureText('M').width || fontPx * 0.6
    this.ch = fontPx
    this.cols = Math.max(4, Math.floor(size / this.cw))
    this.rows = Math.max(4, Math.floor(size / this.ch))
    const asp = (this.cw / this.ch) * (this.cols / this.rows)
    // глаз всегда влезает по ширине плитки
    this.scale = Math.min(0.9, asp / (HALF * 1.06))
    this.jitter = new Float32Array(this.cols * this.rows).map((_, i) => (Math.sin(i * 12.9898) * 43758.5453) % 1)
    this.rowSpeed = Array.from({ length: this.rows }, (_, i) => (5 + ((i * 7919) % 9)) * (i % 3 === 1 ? -1 : 1))
    this.rain = Array.from({ length: this.cols }, (_, i) => ({ v: 7 + ((i * 2654435761) % 10), p: (i * 40503) % 131, len: 3 + (i % 3) }))
  }

  /** Моргнуть и расширить зрачок (нажатие на значок) */
  poke() {
    this.s.blink = 0
    this.s.dil = 1
  }

  /** Зрачок на миг расширяется, без моргания («Воронка» на главной: сделка влетела в зрачок) */
  gulp() {
    this.s.dil = 1
  }

  /** Сразу открытый глаз, без анимации открытия («уменьшить движение») */
  wakeNow() {
    this.s.wake = 1
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
  /** Верхнее и нижнее веко над точкой x (закрытый глаз — верхнее опускается к нижнему: дуга «‿») */
  private lids(x: number) {
    const s = this.s
    const kk = Math.max(0, 1 - (x / HALF) ** 2)
    const open = s.open * s.wake
    const bot = -BOT * Math.pow(kk, 0.9) * (1 - s.squint * 0.18)
    const top0 = TOP * Math.pow(kk, 0.9) - s.squint * 0.12
    return { top: top0 * open + (1 - open) * bot, bot }
  }

  /**
   * Шаг: dt — секунды, gaze — где курсор, awake — должен ли глаз быть открыт, near — курсор рядом (прищур).
   * Без курсора глаз сам изредка смотрит по сторонам.
   */
  step(dt: number, gaze: Gaze, awake: boolean, near: boolean) {
    const s = this.s
    const t = (s.t += dt)
    if (gaze) {
      s.tx = (gaze.dx * this.asp()) / this.scale
      s.ty = gaze.dy / this.scale
    } else if (t > s.nextLook) {
      s.tx = (Math.random() - 0.5) * 1.6
      s.ty = (Math.random() - 0.45) * 0.8
      s.nextLook = t + 1.4 + Math.random() * 2.6
    }
    s.wake += ((awake ? 1 : 0) - s.wake) * Math.min(1, dt * (awake ? 6 : 1.6))
    // зрачок не уходит за край радужки
    const len = Math.hypot(s.tx, s.ty * 1.6) || 1
    const k = Math.min(1, 0.36 / (len * 0.55))
    const aimX = s.tx * 0.55 * k
    const aimY = s.ty * 0.34 * k
    s.vx += ((aimX - s.gx) * 120 - s.vx * 16) * dt
    s.vy += ((aimY - s.gy) * 120 - s.vy * 16) * dt
    s.gx += s.vx * dt
    s.gy += s.vy * dt
    // моргание: само раз в 3–6 с, веки — по кривой
    if (s.blink < 0 && t > s.nextBlink) s.blink = 0
    if (s.blink >= 0) {
      s.blink += dt / 0.26
      const b = Math.min(1, s.blink)
      s.open = 1 - (b < 0.4 ? smooth(0, 0.4, b) : 1 - smooth(0.4, 1, b))
      if (s.blink >= 1) {
        s.blink = -1
        s.open = 1
        s.nextBlink = t + 2.8 + Math.random() * 3.4
      }
    }
    s.squint += ((near ? 1 : 0) - s.squint) * Math.min(1, dt * 4)
    s.dil = Math.max(0, s.dil - dt * 0.7)
    const pupilAim = 0.25 + Math.sin(t * 1.3) * 0.012 - s.squint * 0.06 + s.dil * 0.08
    s.pupilV += ((pupilAim - s.pupil) * 60 - s.pupilV * 9) * dt
    s.pupil += s.pupilV * dt
  }

  draw() {
    const { ctx, cols, rows, cw, ch, s, colors: c } = this
    const W = this.size
    const E = this.scale
    if (!W) return
    ctx.clearRect(0, 0, W, W)
    ctx.fillStyle = rgba(c.tile, 1)
    ctx.fillRect(0, 0, W, W)
    ctx.save()
    ctx.translate((W - cols * cw) / 2, (W - rows * ch) / 2)
    const open = s.open * s.wake
    const hh = (rows * ch) / 2
    const ix = (this.colOf(s.gx) + 0.5) * cw
    const iy = (this.rowOf(s.gy) + 0.5) * ch
    // мягкое свечение за радужкой
    const R = IRIS * E * hh
    const g = ctx.createRadialGradient(ix, iy, R * 0.2, ix, iy, R * 2.3)
    g.addColorStop(0, rgba(c.glow, 0.22 * open))
    g.addColorStop(0.5, rgba(c.glow, 0.07 * open))
    g.addColorStop(1, rgba(c.glow, 0))
    ctx.fillStyle = g
    ctx.fillRect(-W, -W, W * 3, W * 3)
    // подложка формы (белок, радужка) и чёрный зрачок — внутри век: на маленьком значке символы крупные, без подложки глаз не читается
    ctx.save()
    ctx.beginPath()
    for (let i = 0; i <= 40; i++) {
      const x = -HALF + (2 * HALF * i) / 40
      const px = (this.colOf(x) + 0.5) * cw
      const py = (this.rowOf(this.lids(x).top) + 0.5) * ch
      if (i) ctx.lineTo(px, py)
      else ctx.moveTo(px, py)
    }
    for (let i = 40; i >= 0; i--) {
      const x = -HALF + (2 * HALF * i) / 40
      ctx.lineTo((this.colOf(x) + 0.5) * cw, (this.rowOf(this.lids(x).bot) + 0.5) * ch)
    }
    ctx.clip()
    ctx.fillStyle = rgba(c.sclera, 0.3)
    ctx.fillRect(-W, -W, W * 3, W * 3)
    const gi = ctx.createRadialGradient(ix, iy, R * 0.3, ix, iy, R)
    gi.addColorStop(0, rgba(c.iris, 0.9))
    gi.addColorStop(1, rgba(c.irisEdge, 0.75))
    ctx.fillStyle = gi
    ctx.beginPath()
    ctx.arc(ix, iy, R, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = rgba(c.pupil, 1)
    ctx.beginPath()
    ctx.arc(ix, iy, s.pupil * E * hh * 1.02, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // символы: одна заливка на цвет + прозрачность (быстрее, чем менять fillStyle на каждый символ)
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
    const thr = Math.max(0.07, 1 / (rows * E)) // толщина края века — не тоньше строки
    for (let row = 0; row < rows; row++) {
      const y = this.toY(row)
      for (let col = 0; col < cols; col++) {
        const idx = row * cols + col
        const x = this.toX(col)
        const L = this.lids(x)
        const inside = smooth(-0.035, 0.035, L.top - y) * smooth(-0.035, 0.035, y - L.bot) * (Math.abs(x) < HALF ? 1 : 0)
        let b: number
        let color: Rgb
        let iris = false
        if (inside < 0.5) {
          // снаружи — только ресничный край (у спящего глаза — одна дуга)
          if ((Math.abs(y - L.top) < thr || Math.abs(y - L.bot) < thr * 0.85) && Math.abs(x) < HALF * 0.97) {
            b = 0.85
            color = c.lid
          } else continue
        } else {
          const dx = x - s.gx
          const dy = y - s.gy
          const d = Math.hypot(dx, dy)
          if (d < s.pupil) continue
          if (d < IRIS) {
            const ang = Math.atan2(dy, dx)
            const r01 = (d - s.pupil) / (IRIS - s.pupil)
            const fib = 0.5 + 0.5 * Math.sin(ang * 34 + s.t * 0.12 + Math.sin(ang * 5 - s.t * 0.25) * 1.6 + d * 12)
            b = 0.5 + 0.38 * fib + 0.25 * smooth(0.28, 0.08, r01) - 0.55 * smooth(0.8, 1, r01)
            color = r01 < 0.45 ? mix(c.irisCore, c.iris, smooth(0, 0.45, r01)) : mix(c.iris, c.irisEdge, smooth(0.45, 1, r01))
            color = mix(color, c.irisCore, fib * 0.12)
            iris = true
          } else {
            const lidShade = 0.55 + 0.45 * smooth(0, 0.16, L.top - y)
            const corner = 1 - smooth(0.95, HALF, Math.abs(x)) * 0.55
            b = 0.38 + 0.58 * lidShade * corner - 0.22 * smooth(IRIS + 0.14, IRIS, d)
            color = mix(c.lid, c.sclera, 0.62 + lidShade * 0.38)
          }
          // блик
          if (Math.hypot(x - (s.gx - 0.17), y - (s.gy + 0.17)) < 0.095) {
            put(col, row, '@', c.glint, 1)
            continue
          }
          b *= inside
        }
        if (b < 0.08) continue
        // живой код: символ меняется со временем, каждая строка — со своей скоростью и в свою сторону
        const n = DENSE.length
        const glyph = DENSE[((Math.floor(s.t * this.rowSpeed[row] * 0.6 + col * 1.7 + this.jitter[idx] * 9) % n) + n) % n]
        // «дождь» по столбцам
        const drop = this.rain[col]
        const head = ((s.t * drop.v + drop.p) % (rows + 24)) - 12
        const tail = head - row
        const lit = tail >= 0 && tail < drop.len ? 1 - tail / drop.len : 0
        const tone = lit > 0.8 ? mix(color, c.glint, iris ? 0.7 : 0.45) : color
        put(col, row, glyph, tone, (iris ? 0.7 + b * 0.4 : 0.15 + b * 0.95) + lit * 0.3)
      }
    }
    ctx.textBaseline = 'top'
    for (const [key, arr] of buckets) {
      const [r, gg, bb, a] = key.split(',').map(Number)
      ctx.fillStyle = `rgba(${r},${gg},${bb},${a})`
      for (let i = 0; i < arr.length; i += 3) ctx.fillText(glyphs[arr[i + 2]], arr[i] * cw, arr[i + 1] * ch)
    }
    ctx.restore()
  }
}
