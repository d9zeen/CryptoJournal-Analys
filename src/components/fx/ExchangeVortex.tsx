/**
 * «Воронка» (главная, блок «Работает с»; вариант B владельца 20.11.2026 вместо BeamHub «Поток в дневник»):
 * биржи кружат вокруг глаза дневника по наклонной орбите — ближние крупнее и ярче, дальние меньше и уходят за глаз;
 * сделка срывается с биржи там, где та сейчас, и по сужающейся спирали затягивается в дневник (зелёная — плюс, красная — минус).
 * Спираль проступает бледной линией только у последней сделки (владелец: «чтобы линии не двоились»).
 * В центре — живой глаз из кода, как в логотипе (EyeMark / lib/asciiEye, владелец 23.11.2026: «туда надо наш новый глаз»):
 * провожает взглядом огонёк последней сделки до самого зрачка, сделка влетела — зрачок на миг расширяется; сделок нет — смотрит
 * на ближнюю биржу, которая проплывает перед ним. Сделки идут медленнее и реже, чтобы за ними было интересно следить.
 * Под сценой — последняя сделка и счёт сделок: меняются не чаще раза в 3,2 с, мягкой сменой строки (владелец: «мигает — глаз режет»). Наведение мышью замедляет орбиту.
 * Движение — только transform, opacity и stroke-dashoffset (правила CLAUDE.md, «Анимации»); вне экрана и во фоне вкладки стоит;
 * «уменьшить движение» — готовая картинка без огоньков. Сцена декоративная (aria-hidden): биржи списком — рядом, в полосе бирж.
 */
import { useEffect, useRef } from 'react'
import { fmt, useT } from '@/i18n'
import { exchangeLogoUrl } from '@/components/ExchangeLogo'
import { monoFont, readColors } from '@/components/EyeMark'
import { AsciiEye } from '@/lib/asciiEye'
import { formatNumber, formatPnlShort } from '@/lib/format'
import { hasFinePointer, prefersReducedMotion } from '@/lib/motion'
import { useMediaQuery } from '@/lib/useMediaQuery'

const EXCHANGES: [id: string, name: string][] = [
  ['bybit', 'Bybit'],
  ['hyperliquid', 'Hyperliquid'],
  ['binance', 'Binance'],
  ['okx', 'OKX'],
  ['polymarket', 'Polymarket'],
  ['bitget', 'Bitget'],
  ['bingx', 'BingX'],
]
const PAIRS = ['BTC', 'ETH', 'SOL', 'HYPE', 'XRP', 'DOGE', 'AVAX', 'LINK', 'SUI']
const NS = 'http://www.w3.org/2000/svg'
const START_COUNT = 1248
// центр и размер глаза в единицах сцены (как в эффекте ниже: CY и LS)
const EYE_CY = (wide: boolean) => (wide ? 150 : 138)
const EYE_SIZE = (wide: boolean) => (wide ? 104 : 72)

type Attrs = Record<string, string | number>
const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, parent?: Element): SVGElementTagNameMap[K] => {
  const e = document.createElementNS(NS, tag)
  for (const k in attrs) e.setAttribute(k, String(attrs[k]))
  parent?.appendChild(e)
  return e
}
const clamp01 = (t: number) => Math.max(0, Math.min(1, t))
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

export function ExchangeVortex({ className = '' }: { className?: string }) {
  const t = useT()
  const wide = useMediaQuery('(min-width: 640px)')
  const root = useRef<SVGGElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const eyeRef = useRef<HTMLCanvasElement>(null)
  const W = wide ? 760 : 400
  const H = wide ? 360 : 330
  const countText = t.landing.exchanges.vortexCount

  useEffect(() => {
    const g0 = root.current
    const svg = svgRef.current
    const canvas = eyeRef.current
    const ctx = canvas?.getContext('2d')
    if (!g0 || !svg || !canvas || !ctx) return
    const C = !wide
    const uid = `vx${Math.random().toString(36).slice(2, 8)}`
    const CX = W / 2, CY = EYE_CY(wide), RX = C ? 172 : 318, RY = C ? 78 : 112, TS = C ? 38 : 46, LS = EYE_SIZE(wide)
    const TILT = -0.07
    const P = (a: number, r = 1): [number, number] => {
      const x = Math.cos(a) * RX * r, y = Math.sin(a) * RY * r
      return [CX + x * Math.cos(TILT) - y * Math.sin(TILT), CY + x * Math.sin(TILT) + y * Math.cos(TILT)]
    }
    const ell = (r: number, a0: number, a1: number) => {
      let d = ''
      for (let k = 0; k <= 48; k++) {
        const [x, y] = P(a0 + ((a1 - a0) * k) / 48, r)
        d += (k ? ' L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1)
      }
      return d
    }

    const defs = el('defs', {}, g0)
    // дальняя половина орбиты и кольца воронки — за значком
    const back = el('g', {}, g0)
    el('path', { d: ell(1, Math.PI, Math.PI * 2), fill: 'none', stroke: 'var(--color-border)', 'stroke-width': 1.2, 'stroke-dasharray': '3 5' }, back)
    const rings = [0.62, 0.38, 0.2].map((r, k) =>
      el('path', { d: ell(r, 0, Math.PI * 2), fill: 'none', stroke: 'var(--color-border)', 'stroke-width': 1, 'stroke-linecap': 'round', 'stroke-dasharray': ['1.5 7', '1.5 5.5', '1.5 4'][k] }, back),
    )
    const backTiles = el('g', {}, g0)
    const comets = el('g', {}, g0)
    // глаз дневника — холст поверх сцены (живой глаз из кода, как в логотипе)
    const eye = new AsciiEye(ctx, readColors(), monoFont())
    const fitEye = () => {
      const w = canvas.getBoundingClientRect().width
      if (!w) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(w * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      eye.resize(w)
      eye.draw()
    }
    fitEye()
    document.fonts?.load(`800 10px ${monoFont()}`).then(fitEye, () => {})
    const ro = new ResizeObserver(fitEye)
    ro.observe(canvas)
    const mo = new MutationObserver(() => {
      eye.colors = readColors()
      eye.draw()
    })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette'] })
    // куда смотреть: точка сцены → доли половины глаза (вверх — плюс, как у EyeMark)
    const gazeAt = (x: number, y: number) => ({ dx: (x - CX) / (LS / 2), dy: -(y - CY) / (LS / 2) })
    // ближняя половина орбиты и ближние биржи — перед значком
    const front = el('g', {}, g0)
    el('path', { d: ell(1, 0, Math.PI), fill: 'none', stroke: 'var(--color-muted)', 'stroke-opacity': 0.45, 'stroke-width': 1.3 }, front)
    const frontTiles = el('g', {}, g0)
    // подпись: последняя сделка и счёт
    const ty = H - (C ? 44 : 46)
    // подпись «последняя сделка»: две строки по очереди — новая мягко въезжает снизу, старая уходит вверх (не чаще раза в 3,2 с)
    const caption = el('g', {}, g0)
    const lines = [0, 1].map(() => {
      const tx = el('text', { x: CX, y: ty, 'text-anchor': 'middle', 'font-size': C ? 14 : 16, 'font-weight': 600, fill: 'var(--color-text)' }, caption)
      return tx
    })
    const count = el('text', { x: CX, y: ty + (C ? 19 : 22), 'text-anchor': 'middle', 'font-size': C ? 13.5 : 14, fill: 'var(--color-muted)', style: 'font-variant-numeric: tabular-nums' }, g0)
    let n = START_COUNT
    const setCount = () => (count.textContent = fmt(countText, { n: formatNumber(n, 0) }))
    const fill = (tx: SVGTextElement, name: string, pair: string, v: number) => {
      tx.textContent = ''
      el('tspan', { fill: 'var(--color-muted)', 'font-weight': 500 }, tx).textContent = `${name} · ${pair} `
      el('tspan', { fill: v >= 0 ? 'var(--color-up)' : 'var(--color-down)', class: 'num' }, tx).textContent = formatPnlShort(v)
    }
    let cur = 0
    const setLast = (name: string, pair: string, v: number) => {
      const out = lines[cur], inc = lines[1 - cur]
      fill(inc, name, pair, v)
      inc.style.transition = 'none'
      inc.style.transform = 'translateY(12px)'
      inc.style.opacity = '0'
      void inc.getBoundingClientRect()
      // по очереди: старая строка уходит вверх, новая въезжает снизу после неё — строки не наезжают друг на друга
      out.style.transition = 'transform .35s ease-in, opacity .3s ease-in'
      inc.style.transition = 'transform .6s cubic-bezier(.2,.8,.2,1) .3s, opacity .5s ease .3s'
      inc.style.transform = 'translateY(0)'
      inc.style.opacity = '1'
      out.style.transform = 'translateY(-12px)'
      out.style.opacity = '0'
      cur = 1 - cur
    }
    fill(lines[0], 'Bybit', 'BTC', 84)
    lines[1].style.opacity = '0'
    setCount()

    type Tile = SVGGElement & { a0: number; cur: number; name: string }
    const tiles = EXCHANGES.map(([id, name], i) => {
      const g = el('g', { 'data-vortex-node': id }) as Tile
      const cp = el('clipPath', { id: `${uid}${id}` }, defs)
      el('rect', { width: TS, height: TS, rx: TS * 0.24 }, cp)
      const url = exchangeLogoUrl(id)
      if (url) el('image', { href: url, width: TS, height: TS, 'clip-path': `url(#${uid}${id})` }, g)
      el('rect', { width: TS, height: TS, rx: TS * 0.24, fill: 'none', stroke: 'var(--color-border)' }, g)
      g.a0 = (i / EXCHANGES.length) * Math.PI * 2 - Math.PI / 2
      g.cur = g.a0
      g.name = name
      return g
    })

    let angle = 0
    const place = (g: Tile, spread = 1) => {
      const a = g.a0 + angle
      const depth = (Math.sin(a) + 1) / 2 // 0 — дальняя точка, 1 — ближняя
      const [x, y] = P(a)
      const s = (0.66 + depth * 0.44) * (0.5 + spread * 0.5)
      g.setAttribute('transform', `translate(${CX + (x - CX) * spread},${CY + (y - CY) * spread}) scale(${s}) translate(${-TS / 2},${-TS / 2})`)
      g.style.opacity = String((0.42 + depth * 0.58) * clamp01(spread * 1.4))
      const want = Math.sin(a) >= 0 ? frontTiles : backTiles
      if (g.parentNode !== want) want.appendChild(g)
      g.cur = a
    }
    // в своём слое ближние поверх дальних
    const sortLayer = (layer: SVGGElement) => {
      const list = [...layer.children] as Tile[]
      const sorted = [...list].sort((p, q) => Math.sin(p.cur) - Math.sin(q.cur))
      if (sorted.some((g, i) => g !== list[i])) sorted.forEach((g) => layer.appendChild(g))
    }

    // до первого кадра биржи уже в сцене (в центре, прозрачные) — анимация начнётся, когда блок покажется на экране
    tiles.forEach((g) => place(g, 0))

    // спираль от биржи к центру: строится один раз, огонёк бежит по ней пунктиром
    const spiral = (a0: number) => {
      const turn = Math.PI * (1.5 + Math.random() * 0.4)
      let d = ''
      for (let k = 0; k <= 90; k++) {
        const u = k / 90
        const [x, y] = P(a0 + turn * Math.pow(u, 0.8), Math.pow(1 - u, 1.35) * 0.97 + 0.03)
        d += (k ? ' L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1)
      }
      return d
    }
    type Comet = { track: SVGPathElement; trail: SVGPathElement; head: SVGPathElement; L: number; t0: number; dur: number; name: string; pair: string; v: number; pos: [number, number] }
    let live: Comet[] = []
    const spawn = (now: number) => {
      const g = tiles[Math.floor(Math.random() * tiles.length)]
      const d = spiral(g.cur)
      const v = Math.random() < 0.58 ? 30 + Math.random() * 150 : -(20 + Math.random() * 90)
      const color = v >= 0 ? 'var(--color-up)' : 'var(--color-down)'
      const track = el('path', { d, fill: 'none', stroke: 'var(--color-muted)', 'stroke-width': 1, opacity: 0 }, comets)
      const L = track.getTotalLength()
      const trail = el('path', { d, fill: 'none', stroke: color, 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-dasharray': `70 ${L + 120}`, opacity: 0 }, comets)
      const head = el('path', { d, fill: 'none', stroke: color, 'stroke-width': 3.4, 'stroke-linecap': 'round', 'stroke-dasharray': `4 ${L + 120}`, opacity: 0 }, comets)
      live.push({ track, trail, head, L, t0: now, dur: 4200 + Math.random() * 800, name: g.name, pair: PAIRS[Math.floor(Math.random() * PAIRS.length)], v, pos: [CX, CY] })
    }

    const cleanupEye = () => {
      ro.disconnect()
      mo.disconnect()
    }
    if (prefersReducedMotion()) {
      tiles.forEach((g) => place(g))
      sortLayer(frontTiles)
      sortLayer(backTiles)
      eye.wakeNow()
      eye.step(0, null, true, false)
      eye.draw()
      return () => {
        cleanupEye()
        g0.replaceChildren()
      }
    }

    let speed = 1
    let speedTarget = 1
    const slow = () => hasFinePointer() && (speedTarget = 0.3)
    const fast = () => (speedTarget = 1)
    svg.addEventListener('pointerenter', slow)
    svg.addEventListener('pointerleave', fast)
    let visible = false
    const io = new IntersectionObserver((es) => (visible = es[0].isIntersecting))
    io.observe(svg)

    const intro = [back, front, caption, count]
    intro.forEach((e) => (e.style.opacity = '0'))
    canvas.style.opacity = '0'
    let start = -1, prev = 0, clock = 0, next = 0, raf = 0, shownAt = 0
    let pending: Comet | null = null
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (!visible || document.hidden) {
        prev = now
        return
      }
      if (start < 0) start = prev = now
      const dt = Math.min(64, now - prev)
      prev = now
      clock += dt // своё время сцены: вне экрана стоит, а не «догоняет»
      if (clock < 2200) {
        back.style.opacity = front.style.opacity = String(easeOut(clamp01(clock / 700)))
        canvas.style.opacity = String(easeOut(clamp01((clock - 200) / 500)))
        caption.style.opacity = count.style.opacity = String(easeOut(clamp01((clock - 1200) / 600)))
      }
      // биржи разлетаются из центра на орбиту
      const spread = easeOut(clamp01((clock - 300) / 1300))
      speed += (speedTarget - speed) * 0.05
      angle += dt * 0.00011 * speed
      tiles.forEach((g) => place(g, spread))
      sortLayer(frontTiles)
      sortLayer(backTiles)
      rings.forEach((r, k) => r.setAttribute('stroke-dashoffset', String((-(clock * (0.008 + k * 0.007))) % 1000)))
      if (clock > 1700 && clock > next) {
        spawn(now)
        next = clock + 1500 + Math.random() * 900
      }
      if (pending && clock - shownAt > 3200) {
        setLast(pending.name, pending.pair, pending.v)
        setCount()
        pending = null
        shownAt = clock
      }
      // бледная спираль — только у последней сделки: линии не двоятся
      const newest = live[live.length - 1]
      live = live.filter((c) => {
        const k = (now - c.t0) / c.dur
        if (k >= 1) {
          c.head.remove()
          c.trail.remove()
          c.track.remove()
          n++
          pending = c
          if (clock - shownAt > 3200) {
            setLast(pending.name, pending.pair, pending.v)
            setCount()
            pending = null
            shownAt = clock
          }
          eye.gulp() // сделка влетела в зрачок
          return false
        }
        const s = Math.pow(k, 1.45) * (c.L + 4) // разгоняется к центру, как в воронке
        c.head.setAttribute('stroke-dashoffset', String(-(s - 4)))
        c.trail.setAttribute('stroke-dashoffset', String(-(s - 70)))
        const op = Math.min(clamp01(k / 0.06), k > 0.9 ? (1 - k) / 0.1 : 1)
        c.head.setAttribute('opacity', String(op))
        c.trail.setAttribute('opacity', String(0.38 * op))
        const want = c === newest ? 0.4 * Math.sin(Math.PI * k) : 0
        const was = Number(c.track.getAttribute('opacity'))
        c.track.setAttribute('opacity', String(was + (want - was) * 0.12))
        const p = c.head.getPointAtLength(Math.min(c.L, Math.max(0, s)))
        c.pos = [p.x, p.y]
        return true
      })
      // глаз провожает последнюю сделку; сделок нет — смотрит на ближнюю биржу
      const target = live[live.length - 1]
      let gaze
      if (target) gaze = gazeAt(target.pos[0], target.pos[1])
      else {
        const nearest = tiles.reduce((a, b) => (Math.sin(b.cur) > Math.sin(a.cur) ? b : a))
        const [x, y] = P(nearest.cur)
        gaze = gazeAt(x, y)
      }
      eye.step(dt / 1000, gaze, true, false)
      eye.draw()
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      svg.removeEventListener('pointerenter', slow)
      svg.removeEventListener('pointerleave', fast)
      cleanupEye()
      g0.replaceChildren()
    }
  }, [wide, W, H, countText])

  return (
    <div data-vortex aria-hidden className={`relative w-full ${className}`}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full overflow-visible" style={{ touchAction: 'pan-y' }}>
        <g ref={root} />
      </svg>
      {/* глаз — поверх сцены, в её центре; размер — доля ширины сцены (как плитка значка в SVG) */}
      <canvas
        ref={eyeRef}
        data-vortex-eye
        className="bg-eye-tile ring-logo-tile-border pointer-events-none absolute block aspect-square -translate-x-1/2 -translate-y-1/2 rounded-[22%] ring-1"
        style={{ left: '50%', top: `${(EYE_CY(wide) / H) * 100}%`, width: `${(EYE_SIZE(wide) / W) * 100}%` }}
      />
    </div>
  )
}
