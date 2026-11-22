/**
 * Большой глаз из строк кода — центр 3D-планетария на «Биржах» (владелец 22.11.2026: вариант 1 «Глаз в центре», вторая версия:
 * «не видно, что идёт как код», «странно меняются свечки», «глаз поворачивается на биржу», «в разы лучше»).
 * Рисует на canvas (текстура для Three.js): облако НАСТОЯЩИХ строк кода дневника бежит влево (каждая строка со своей скоростью),
 * сверху вниз пробегает свет; поверх — глаз: чёткое веко (ресничный край, складка), светлый белок из тёмных символов,
 * фиолетовая радужка с тёмным ободком, чёрный зрачок со светлым краем и бликом. Облако тает к краям холста — без рамки.
 * В зрачке — свечи сделок, плавно как на бирже: новая свеча вырастает от открытия до закрытия, старые съезжают на место влево,
 * масштаб догоняет мягко. Взгляд — на пружинке, моргание, сон (веко закрыто), прищур.
 * Только расчёт и рисование; сцена, ввод и цикл кадров — components/fx/Planetarium3D.tsx.
 */
import { smooth as sm, type Rgb } from '@/lib/asciiEye'

export type CodeEyeColors = {
  sclera: Rgb
  irisCore: Rgb
  iris: Rgb
  irisEdge: Rgb
  pupil: Rgb
  glint: Rgb
  /** ресничный край и складка века */
  line: Rgb
  /** символы облака вокруг глаза */
  code: Rgb
  /** символы на белке и тень под веком */
  ink: Rgb
}

/** Строки «кода дневника» — декорация (одинаковые на всех языках, это код, а не текст интерфейса) */
const CODE = [
  'const pnl = (exit - entry) * qty * side;',
  'if (pnl > 0) wins++; else losses++;',
  'trades.push({ pair, side, entry, exit });',
  'const r = pnl / risk;',
  'await sync(exchange, { since });',
  'winrate = wins / total;',
  'stop = entry * (1 - 0.012);',
  'for (const fill of fills) position.add(fill);',
  'equity += pnl - fee;',
  'drawdown = Math.max(drawdown, peak - equity);',
  "const dir = close > open ? 'up' : 'down';",
  'journal.save(trade);',
  'const fee = qty * price * 0.00055;',
  'return { pnl, r, fee, duration };',
  'watch(bybit, binance, okx, hyperliquid);',
  'eye.look(exchange);',
  'const avg = sum / n;',
  'if (r < -1) mistakes.add("no stop");',
  'calendar[day] += pnl;',
  'setup = trade.setup ?? "breakout";',
  'const best = max(trades, (t) => t.pnl);',
  'emit("trade", trade);',
]

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const rgba = (c: Rgb, a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`
const ease = (x: number) => x * x * (3 - 2 * x)

/** Предсказуемый генератор: одинаковые строки при каждом открытии */
function rng(seed: number) {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

type Candle = { o: number; c: number; h: number; l: number }

/** Размер холста-текстуры и сетки символов */
export const CODE_EYE_W = 1100
export const CODE_EYE_H = 700
const FONT = 14
const E = 0.64 // размер глаза относительно высоты холста
const HALF = 1.42 // половина ширины глаза (в половинах высоты)
const IRIS = 0.52
const CANDLES = 7

export class CodeEye {
  private cw = 0
  private ch = 0
  private cols = 0
  private rows = 0
  private ox = 0
  private oy = 0
  private asp = 1
  private rowText: string[] = []
  private rowSpeed: number[] = []
  private rain: { v: number; p: number; len: number }[] = []
  private series: Candle[] = []
  private view = { lo: 0, hi: 1, slide: 0, grow: 1 }
  private rand = rng(7)
  /** состояние взгляда и век (снаружи читается только для теста и положения зрачка) */
  readonly s = {
    gx: 0,
    gy: 0,
    vx: 0,
    vy: 0,
    tx: 0,
    ty: 0,
    open: 1,
    blink: -1,
    nextBlink: 2.4,
    squint: 0,
    pupil: 0.27,
    pv: 0,
    dil: 0,
    wake: 1,
    t: 0,
    nextLook: 1,
  }

  constructor(
    private ctx: CanvasRenderingContext2D,
    public colors: CodeEyeColors,
    font: string,
  ) {
    ctx.font = `600 ${FONT}px ${font}`
    ctx.textBaseline = 'top'
    this.cw = ctx.measureText('M').width || FONT * 0.6
    this.ch = FONT * 1.05
    this.cols = Math.floor(CODE_EYE_W / this.cw)
    this.rows = Math.floor(CODE_EYE_H / this.ch)
    this.ox = (CODE_EYE_W - this.cols * this.cw) / 2
    this.oy = (CODE_EYE_H - this.rows * this.ch) / 2
    this.asp = (this.cw / this.ch) * (this.cols / this.rows)
    const r = this.rand
    this.rowText = Array.from({ length: this.rows }, () => {
      let s = ''
      while (s.length < 600) s += CODE[Math.floor(r() * CODE.length)] + '   '
      return s
    })
    this.rowSpeed = Array.from({ length: this.rows }, () => 2.2 + r() * 4.5)
    this.rain = Array.from({ length: this.cols }, () => ({ v: 9 + r() * 12, p: r() * 200, len: 4 + Math.floor(r() * 6) }))
    let p = 100
    for (let i = 0; i < CANDLES; i++) {
      const c = p + (r() - 0.42) * 6
      this.series.push({ o: p, c, h: Math.max(p, c) + r() * 2.2, l: Math.min(p, c) - r() * 2.2 })
      p = c
    }
    this.view.lo = Math.min(...this.series.map((x) => x.l))
    this.view.hi = Math.max(...this.series.map((x) => x.h))
  }

  /** Пришла сделка: новая свеча (вверх — прибыль, вниз — убыток), зрачок чуть расширяется */
  addCandle(up: boolean) {
    const r = this.rand
    const o = this.series[this.series.length - 1].c
    const c = o + (up ? 1 : -1) * (1.2 + r() * 3.4)
    this.series.push({ o, c, h: Math.max(o, c) + r() * 1.8, l: Math.min(o, c) - r() * 1.8 })
    this.view.slide = 1
    this.view.grow = 0
    this.s.dil = 1
  }

  /** Моргнуть и расширить зрачок («Обновить все») */
  poke() {
    this.s.blink = 0
    this.s.dil = 1
  }

  /** Сразу открытый глаз без анимации («уменьшить движение») */
  wakeNow() {
    this.s.wake = 1
  }

  /** Сколько свечей сейчас в памяти (для теста) */
  get candleCount() {
    return this.series.length
  }

  /** Зрачок в долях холста (0…1): туда летят огоньки-сделки */
  pupilUv(): { u: number; v: number } {
    return { u: this.pxX(this.s.gx) / CODE_EYE_W, v: this.pxY(this.s.gy) / CODE_EYE_H }
  }

  private toX(col: number) {
    return ((((col + 0.5) / this.cols) * 2 - 1) * this.asp) / E
  }
  private toY(row: number) {
    return (1 - ((row + 0.5) / this.rows) * 2) / E
  }
  private pxX(x: number) {
    return this.ox + (((x * E) / this.asp + 1) / 2) * this.cols * this.cw
  }
  private pxY(y: number) {
    return this.oy + ((1 - y * E) / 2) * this.rows * this.ch
  }
  private lids(x: number) {
    const s = this.s
    const kk = Math.max(0, 1 - (x / HALF) ** 2)
    const o = s.open * s.wake
    const bot = -0.58 * Math.pow(kk, 1.05) * (1 - s.squint * 0.18)
    const top0 = 0.8 * Math.pow(kk, 1.05) - s.squint * 0.12
    return { top: top0 * o + (1 - o) * bot, bot, top0, kk }
  }

  /**
   * Шаг: gaze — куда смотреть в долях половины холста (null — сам изредка смотрит по сторонам),
   * awake — открыт ли глаз, near — щуриться (курсор на глазу).
   */
  step(dt: number, gaze: { x: number; y: number } | null, awake: boolean, near: boolean) {
    const s = this.s
    const t = (s.t += dt)
    if (gaze) {
      s.tx = (gaze.x * this.asp) / E
      s.ty = gaze.y / E
    } else if (t > s.nextLook) {
      s.tx = (Math.random() - 0.5) * 1.4
      s.ty = (Math.random() - 0.45) * 0.7
      s.nextLook = t + 1.5 + Math.random() * 2.5
    }
    s.wake += ((awake ? 1 : 0) - s.wake) * Math.min(1, dt * (awake ? 6 : 1.5))
    const len = Math.hypot(s.tx, s.ty * 1.6) || 1
    const k = Math.min(1, 0.34 / (len * 0.55))
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
        s.nextBlink = t + 2.8 + Math.random() * 3.2
      }
    }
    s.squint += ((near ? 1 : 0) - s.squint) * Math.min(1, dt * 4)
    s.dil = Math.max(0, s.dil - dt * 1.4)
    const aim = 0.26 + Math.sin(t * 1.3) * 0.01 - s.squint * 0.05 + s.dil * 0.05
    s.pv += ((aim - s.pupil) * 60 - s.pv * 9) * dt
    s.pupil += s.pv * dt
    // свечи: съезд влево, рост новой, масштаб догоняет мягко
    const v = this.view
    v.slide = Math.max(0, v.slide - dt / 0.55)
    v.grow = Math.min(1, v.grow + dt / 0.6)
    if (v.slide === 0 && this.series.length > CANDLES) this.series = this.series.slice(-CANDLES)
    const vis = this.series.slice(-CANDLES)
    const lo = Math.min(...vis.map((x) => x.l))
    const hi = Math.max(...vis.map((x) => x.h))
    const kk = Math.min(1, dt * 3.5)
    v.lo += (lo - v.lo) * kk
    v.hi += (hi - v.hi) * kk
  }

  private drawCandles(ix: number, iy: number, rp: number) {
    const { ctx: g, view, colors: c } = this
    g.save()
    g.beginPath()
    g.arc(ix, iy, rp * 0.97, 0, Math.PI * 2)
    g.clip()
    const w = rp * 1.45
    const h = rp * 1.0
    const slot = w / (CANDLES - 1)
    const yOf = (val: number) => iy + h / 2 - ((val - view.lo) / Math.max(1e-6, view.hi - view.lo)) * h
    const shift = ease(view.slide)
    const list = this.series.slice(-(CANDLES + 1))
    list.forEach((cd, i) => {
      const fromEnd = list.length - 1 - i // 0 — самая новая
      const x = ix + w / 2 - (fromEnd - shift) * slot
      const gr = fromEnd === 0 ? ease(view.grow) : 1
      const close = cd.o + (cd.c - cd.o) * gr
      const hi = cd.o + (Math.max(cd.h, close) - cd.o) * gr
      const lo = cd.o + (Math.min(cd.l, close) - cd.o) * gr
      const col = cd.c >= cd.o ? c.irisCore : c.iris
      g.globalAlpha = Math.min(1, Math.max(0, (x - (ix - w / 2 - slot)) / slot))
      g.strokeStyle = rgba(col, 0.9)
      g.lineWidth = 1.6
      g.beginPath()
      g.moveTo(x, yOf(hi))
      g.lineTo(x, yOf(lo))
      g.stroke()
      const y1 = yOf(Math.max(cd.o, close))
      const y2 = yOf(Math.min(cd.o, close))
      g.fillStyle = rgba(col, 1)
      g.beginPath()
      g.roundRect(x - slot * 0.24, y1, slot * 0.48, Math.max(2, y2 - y1), 1.5)
      g.fill()
    })
    g.restore()
    g.globalAlpha = 1
  }

  draw() {
    const { ctx: g, s, colors: c, cols, rows, cw, ch, ox, oy } = this
    const W = CODE_EYE_W
    const H = CODE_EYE_H
    const t = s.t
    g.clearRect(0, 0, W, H)
    const ix = this.pxX(s.gx)
    const iy = this.pxY(s.gy)
    const unit = ((rows * ch) / 2) * E
    const rp = s.pupil * unit
    const ri = IRIS * unit
    const almond = () => {
      g.beginPath()
      for (let i = 0; i <= 48; i++) {
        const x = -HALF + (2 * HALF * i) / 48
        const y = this.pxY(this.lids(x).top)
        if (i) g.lineTo(this.pxX(x), y)
        else g.moveTo(this.pxX(x), y)
      }
      for (let i = 48; i >= 0; i--) {
        const x = -HALF + (2 * HALF * i) / 48
        g.lineTo(this.pxX(x), this.pxY(this.lids(x).bot))
      }
    }
    // подложка внутри век: белок (к уголкам темнее), тень под веком, радужка с ободком, зрачок со свечами
    g.save()
    almond()
    g.clip()
    const sg = g.createRadialGradient(ix, iy, ri * 0.8, ix, iy, unit * 1.5)
    sg.addColorStop(0, rgba(c.sclera, 0.62))
    sg.addColorStop(0.6, rgba(c.sclera, 0.42))
    sg.addColorStop(1, rgba(c.line, 0.16))
    g.fillStyle = sg
    g.fillRect(0, 0, W, H)
    const lidTop = this.pxY(this.lids(0).top)
    const sh = g.createLinearGradient(0, lidTop, 0, this.pxY(this.lids(0).top - 0.28))
    sh.addColorStop(0, rgba(c.ink, 0.55))
    sh.addColorStop(1, rgba(c.ink, 0))
    g.fillStyle = sh
    g.fillRect(0, 0, W, H)
    const gi = g.createRadialGradient(ix, iy, rp, ix, iy, ri)
    gi.addColorStop(0, rgba(c.iris, 0.8))
    gi.addColorStop(0.7, rgba(c.iris, 0.5))
    gi.addColorStop(1, rgba(c.irisEdge, 0.75))
    g.fillStyle = gi
    g.beginPath()
    g.arc(ix, iy, ri, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = rgba(c.irisEdge, 0.9)
    g.lineWidth = 3
    g.stroke()
    g.fillStyle = rgba(c.pupil, 1)
    g.beginPath()
    g.arc(ix, iy, rp, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = rgba(c.irisCore, 0.45)
    g.lineWidth = 1.5
    g.beginPath()
    g.arc(ix, iy, rp + 1, 0, Math.PI * 2)
    g.stroke()
    this.drawCandles(ix, iy, rp)
    g.restore()

    // символы: одна заливка на цвет + прозрачность
    const buckets = new Map<string, number[]>()
    const glyphs: string[] = []
    const put = (col: number, row: number, glyph: string, color: Rgb, a: number) => {
      if (a <= 0.03) return
      const key = `${((color[0] / 8) | 0) * 8},${((color[1] / 8) | 0) * 8},${((color[2] / 8) | 0) * 8},${Math.round(Math.min(1, a) * 20) / 20}`
      let arr = buckets.get(key)
      if (!arr) buckets.set(key, (arr = []))
      arr.push(ox + col * cw, oy + row * ch, glyphs.push(glyph) - 1)
    }
    for (let row = 0; row < rows; row++) {
      const y = this.toY(row)
      const text = this.rowText[row]
      const off = Math.floor(t * this.rowSpeed[row])
      for (let col = 0; col < cols; col++) {
        const x = this.toX(col)
        const L = this.lids(x)
        const inside = sm(-0.03, 0.03, L.top - y) * sm(-0.03, 0.03, y - L.bot) * (Math.abs(x) < HALF ? 1 : 0)
        // облако кода тает к краям холста
        const ex = ((ox + col * cw) / W) * 2 - 1
        const ey = ((oy + row * ch) / H) * 2 - 1
        const edge = sm(1.0, 0.55, Math.hypot(ex, ey * 1.05))
        if (edge <= 0) continue
        let b: number
        let color: Rgb
        let kind: 'cloud' | 'sclera' | 'iris' = 'cloud'
        if (inside < 0.5) {
          const dEye = Math.hypot(x / 1.7, (y + 0.05) / 1.1)
          b = 0.03 + 0.2 * sm(1.9, 0.85, dEye)
          color = c.code
        } else {
          const dx = x - s.gx
          const dy = y - s.gy
          const d = Math.hypot(dx, dy)
          if (d < s.pupil + 0.02) continue
          if (d < IRIS) {
            const ang = Math.atan2(dy, dx)
            const r01 = (d - s.pupil) / (IRIS - s.pupil)
            const fib = 0.5 + 0.5 * Math.sin(ang * 34 + t * 0.12 + Math.sin(ang * 5 - t * 0.25) * 1.6 + d * 12)
            b = 0.55 + 0.4 * fib + 0.2 * sm(0.3, 0.05, r01) - 0.45 * sm(0.82, 1, r01)
            color = r01 < 0.45 ? mix(c.irisCore, c.iris, sm(0, 0.45, r01)) : mix(c.iris, c.irisEdge, sm(0.45, 1, r01))
            kind = 'iris'
          } else {
            b = 1
            color = c.ink
            kind = 'sclera'
          }
        }
        const glyph = text[(col + off) % text.length]
        if (glyph === ' ') continue
        const drop = this.rain[col]
        const head = ((t * drop.v + drop.p) % (rows + 30)) - 15
        const tail = head - row
        const lit = tail >= 0 && tail < drop.len ? 1 - tail / drop.len : 0
        let a: number
        if (kind === 'iris') a = 0.72 + b * 0.3
        else if (kind === 'sclera') a = 0.45 + lit * 0.3
        else a = 0.05 + b * 0.8 + lit * 0.35
        const tone = lit > 0.75 ? (kind === 'sclera' ? c.iris : mix(color, c.glint, kind === 'iris' ? 0.6 : 0.5)) : color
        put(col, row, glyph, tone, a * edge)
      }
    }
    for (const [key, arr] of buckets) {
      const [r, gg, bb, a] = key.split(',').map(Number)
      g.fillStyle = `rgba(${r},${gg},${bb},${a})`
      for (let i = 0; i < arr.length; i += 3) g.fillText(glyphs[arr[i + 2]], arr[i], arr[i + 1])
    }
    // веки: ресничный край, нижнее веко, складка
    const lidPath = (fn: (x: number) => number, x0 = -HALF, x1 = HALF) => {
      g.beginPath()
      for (let i = 0; i <= 60; i++) {
        const x = x0 + ((x1 - x0) * i) / 60
        const yy = this.pxY(fn(x))
        if (i) g.lineTo(this.pxX(x), yy)
        else g.moveTo(this.pxX(x), yy)
      }
    }
    g.lineCap = 'round'
    lidPath((x) => this.lids(x).top)
    g.strokeStyle = rgba(c.line, 0.95)
    g.lineWidth = 3.5
    g.stroke()
    lidPath((x) => this.lids(x).bot)
    g.strokeStyle = rgba(c.line, 0.55)
    g.lineWidth = 2
    g.stroke()
    lidPath(
      (x) => {
        const L = this.lids(x)
        return L.top0 + 0.2 * Math.pow(L.kk, 0.6) + 0.05
      },
      -HALF * 0.86,
      HALF * 0.86,
    )
    g.strokeStyle = rgba(c.line, 0.28 * s.wake)
    g.lineWidth = 1.6
    g.stroke()
    // блики (внутри век): мягкий большой и острый маленький — отражение, не двигаются относительно зрачка
    g.save()
    almond()
    g.clip()
    const hx = ix - unit * 0.17
    const hy = iy - unit * 0.17
    const hg = g.createRadialGradient(hx, hy, 0, hx, hy, unit * 0.13)
    hg.addColorStop(0, rgba(c.glint, 0.85))
    hg.addColorStop(0.45, rgba(c.glint, 0.35))
    hg.addColorStop(1, rgba(c.glint, 0))
    g.fillStyle = hg
    g.fillRect(hx - unit * 0.2, hy - unit * 0.2, unit * 0.4, unit * 0.4)
    g.fillStyle = rgba(c.glint, 0.9)
    g.beginPath()
    g.arc(ix + unit * 0.13, iy + unit * 0.11, unit * 0.025, 0, Math.PI * 2)
    g.fill()
    g.restore()
  }
}
