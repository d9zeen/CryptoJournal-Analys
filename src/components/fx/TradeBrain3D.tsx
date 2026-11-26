/**
 * «Мозг из сделок» на странице «Биржи» (владелец 26.11.2026: «а можем сделать это как нейронные связки» → вариант «Мозг из сделок»;
 * до этого — «Спираль времени» с жетонами-монетками, а ещё раньше планетарий с глазом и «Башни бирж»).
 *
 * Каждая сделка — нейрон: жетон с аватаркой монеты (логотип из «Портфеля», обводка — плюс --color-up / минус --color-down, крупнее — больше сумма),
 * жетоны крутятся вокруг своей оси, как монетки, соседние — в разные стороны (владелец 25.11.2026).
 * Все вместе — облако-шар (чуть вытянутое, как мозг); место нейрона постоянное (из id сделки), ближайшие соединены тонкими нитями.
 *  - по нитям всё время бегут редкие импульсы; новая сделка (при открытии — последние 8 по одной, потом — от синхронизации) «зажигается»:
 *    кольцо, импульсы к соседям и дальше — волна по сети;
 *  - «Обновить» в углу сцены — волна импульсов от центра наружу;
 *  - весь «мозг» медленно вращается сам (владелец: «сама по себе крутилась»); потянуть — повернуть с инерцией; сцена чуть наклоняется за мышью;
 *  - наведение на нейрон — карточка сделки (целиком в сцене), его нити подсвечены, остальное тише, вращение замирает; клик — страница сделки;
 *  - наведение на биржу в списке рядом (focus) — горят только её сделки.
 * Палец: касание — карточка, второе — сделка; тянуть вбок — поворот, вертикальная прокрутка страницы не ломается. Колесо мыши страницу не перехватывает.
 * Клавиатура и дикторы — скрытые кнопки последних сделок (data-brain-trade): фокус = наведение, Enter — сделка.
 * «Уменьшить движение» — без вращения, импульсов и появления. Вне экрана и в фоновой вкладке не рисуем; пиксели ≤ 1,5×;
 * сцена строится, когда страница свободна; без видеокарты (SwiftShader / llvmpipe) — пиксели 1×, реже кадры, меньше импульсов.
 * Цвета — токены theme.css, перекрашивается при смене темы / палитры.
 */
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { exchangeLogoUrl } from '@/components/ExchangeLogo'
import { formatPnl, formatPnlShort } from '@/lib/format'

export type BrainTrade = {
  id: string
  exchange: string
  /** название биржи для подсказки */
  exName: string
  /** коротко для подписи у жетона: BTC */
  label: string
  /** полностью для подсказки: BTCUSDT */
  symbol: string
  /** Long / Short */
  side: string
  pnl: number
  /** «сегодня, 14:05» — для подсказки */
  when: string
  /** иконка монеты (наш Storage coin-icons); нет — буквы монеты */
  icon: string | null
}

type Props = {
  /** от старых к новым */
  trades: BrainTrade[]
  /** высота сцены; ширина — в 1,3 раза больше */
  size: number
  /** биржа под мышью в списке рядом — горят только её сделки */
  focus: string | null
  busy: boolean
  onOpenTrade: (id: string) => void
  onRefresh: () => void
  labels: { scene: string; refresh: string; empty: string; enter: string; exit: string }
  /** WebGL недоступен — нарисовать запасной вариант */
  onFail?: () => void
}

function tokenColor(name: string): THREE.Color {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888'
  const cv = document.createElement('canvas')
  cv.width = cv.height = 1
  const ctx = cv.getContext('2d')!
  ctx.fillStyle = '#888'
  ctx.fillStyle = raw
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace)
}
const readPalette = () => ({
  up: tokenColor('--color-up'),
  down: tokenColor('--color-down'),
  surface: tokenColor('--color-surface'),
  base: tokenColor('--color-surface-2'),
  muted: tokenColor('--color-muted'),
  primary: tokenColor('--color-primary'),
  light: document.documentElement.dataset.theme === 'light',
})
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** радиус облака и его вытянутость (как мозг: шире, чем выше) */
const R = 2.35
const SHAPE = new THREE.Vector3(1.3, 0.92, 1.05)
/** сколько ближайших соседей у нейрона */
const LINKS = 3
const REPLAY = 8
const CAM_D = 11
/** камера внутри «мозга» (владелец 26.11.2026: «хочу зайти в этот мозг и клацать внутри на разные сделки») */
const CAM_IN = 0.9
/** самовращение, рад/с — оборот примерно за 45 с */
const AUTO_SPIN = 0.14
/** толщина жетона (доля диаметра) */
const COIN_T = 0.07
const Y_AXIS = new THREE.Vector3(0, 1, 0)
const easeOut = (k: number) => 1 - Math.pow(1 - k, 3)
const spring = (k: number) => 1 - Math.cos(k * Math.PI * 3.2) * Math.exp(-k * 6)

/** постоянное место нейрона — из id сделки (при смене диапазона и новых сделках остальные не прыгают) */
function hash(str: string, seed: number): number {
  let h = 2166136261 ^ seed
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  h ^= h >>> 13
  h = Math.imul(h, 0x5bd1e995)
  h ^= h >>> 15
  return (h >>> 0) / 4294967296
}
function placeOf(id: string, out: THREE.Vector3): THREE.Vector3 {
  const u = hash(id, 1) * 2 - 1
  const phi = hash(id, 2) * Math.PI * 2
  const r = R * (0.42 + 0.58 * Math.cbrt(hash(id, 3)))
  const s = Math.sqrt(1 - u * u)
  return out.set(s * Math.cos(phi), u, s * Math.sin(phi)).multiplyScalar(r).multiply(SHAPE)
}

/** нейрон: две стороны с иконкой + ребро цвета результата; крутится вокруг своей оси, как монетка */
type Node = THREE.Group & {
  userData: {
    tr: BrainTrade
    i: number
    size: number
    /** grow — появление при открытии (t0 — когда начать), arrive — «зажглась» новая сделка, still — стоит, wait — ждёт своей очереди */
    mode: 'grow' | 'arrive' | 'still' | 'wait'
    t0: number
    f: number
    hs: number
    spin: number
    ang: number
    lit: boolean
    face: THREE.MeshBasicMaterial
    edge: THREE.MeshBasicMaterial
  }
}

export function TradeBrain3D({ trades, size, focus, busy, onOpenTrade, onRefresh, labels, onFail }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const live = useRef({ trades, focus, busy, onOpenTrade, sel: null as string | null })
  live.current.trades = trades
  live.current.focus = focus
  live.current.busy = busy
  live.current.onOpenTrade = onOpenTrade
  const [sel, setSel] = useState<string | null>(null)
  live.current.sel = sel
  const [inner, setInner] = useState(false)
  const W = Math.round(size * 1.3)
  const small = size < 330

  useEffect(() => {
    const host = wrap.current
    if (!host) return
    // сцену строим, когда страница свободна (не мешаем подключению биржи, загрузке списков): на слабом процессоре сборка шейдеров — до секунды
    let cancelled = false
    let stop: (() => void) | undefined
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 300))
    const unidle = window.cancelIdleCallback ?? window.clearTimeout
    const idleId = idle(() => {
      if (!cancelled) stop = start(host)
    }, { timeout: 1500 })
    return () => {
      cancelled = true
      unidle(idleId)
      stop?.()
    }
    // сцена строится один раз на размер; сделки, фокус и «идёт обновление» читаются из live в цикле кадров
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, size, small])

  function start(host: HTMLDivElement): (() => void) | undefined {
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
    } catch {
      onFail?.()
      return
    }
    const gl = renderer.getContext()
    const dbg = gl.getExtension('WEBGL_debug_renderer_info')
    const soft = /swiftshader|llvmpipe|software/i.test(String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)))
    renderer.setPixelRatio(soft ? 1 : Math.min(window.devicePixelRatio || 1, 1.5))
    renderer.setSize(W, size)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    const canvas = renderer.domElement
    canvas.setAttribute('aria-hidden', 'true')
    canvas.dataset.brainCanvas = ''
    canvas.style.touchAction = 'pan-y'
    host.prepend(canvas)

    const still = reduced()
    let C = readPalette()
    const disposables: { dispose: () => void }[] = []
    const track = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x)

    const scene = new THREE.Scene()
    const fog = new THREE.Fog(C.surface, 8.5, 15)
    scene.fog = fog
    const camera = new THREE.PerspectiveCamera(30, W / size, 0.1, 60)
    const LOOK = new THREE.Vector3(0, 0, 0)
    const brain = new THREE.Group()
    scene.add(brain)

    // HTML поверх сцены: подписи последних сделок и карточка сделки
    const mk = (cls: string) => {
      const el = document.createElement('div')
      el.className = cls
      el.setAttribute('aria-hidden', 'true')
      host.appendChild(el)
      return el
    }
    const gls = Array.from({ length: small ? 2 : 4 }, () =>
      mk('pointer-events-none absolute left-0 top-0 z-[2] flex items-baseline gap-1.5 whitespace-nowrap text-xs font-semibold transition-opacity duration-300'),
    )
    const tip = mk('pointer-events-none absolute left-0 top-0 z-[5] whitespace-nowrap rounded-xl border border-border bg-surface px-3 py-2.5 text-sm opacity-0 shadow-lg transition-opacity duration-150')
    tip.dataset.brainTip = ''

    // ---------- жетоны с аватаркой монеты ----------
    let nodes: Node[] = []
    let maxAbs = 1
    const faceGeo = track(new THREE.CircleGeometry(0.5, 48))
    const edgeGeo = track(new THREE.CylinderGeometry(0.5, 0.5, COIN_T, 48, 1, true))
    edgeGeo.rotateX(Math.PI / 2)
    const faceCam = new THREE.Quaternion()
    const spinQ = new THREE.Quaternion()
    const sizeOf = (pnl: number) => 0.3 + 0.18 * Math.sqrt(Math.min(1, Math.abs(pnl) / maxAbs))
    const TEX = 128
    type Tok = { cv: HTMLCanvasElement; tex: THREE.CanvasTexture; img: HTMLImageElement | null; up: boolean; label: string }
    const toks = new Map<string, Tok>()
    const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888'
    const drawTok = (t: Tok) => {
      const x = t.cv.getContext('2d')!
      const c = TEX / 2
      x.clearRect(0, 0, TEX, TEX)
      x.beginPath()
      x.arc(c, c, c - 2, 0, Math.PI * 2)
      x.fillStyle = css(t.up ? '--color-up' : '--color-down')
      x.fill()
      x.beginPath()
      x.arc(c, c, c - 11, 0, Math.PI * 2)
      x.fillStyle = css('--color-surface-2')
      x.fill()
      if (t.img) {
        x.save()
        x.beginPath()
        x.arc(c, c, c - 13, 0, Math.PI * 2)
        x.clip()
        x.drawImage(t.img, 13, 13, TEX - 26, TEX - 26)
        x.restore()
      } else {
        x.fillStyle = css('--color-muted')
        x.font = `700 ${t.label.length > 3 ? 28 : 34}px ${css('--font-mono') || 'monospace'}`
        x.textAlign = 'center'
        x.textBaseline = 'middle'
        x.fillText(t.label.slice(0, 4), c, c + 2)
      }
      t.tex.needsUpdate = true
    }
    // иконку берём через fetch → blob: картинка своя (холст не «пачкается», WebGL её примет), SVG без размеров получает 128×128
    let dead = false
    const blobs: string[] = []
    const icons = new Map<string, Promise<HTMLImageElement>>()
    const loadIcon = (url: string) => {
      let p = icons.get(url)
      if (!p) {
        p = fetch(url)
          .then((r) => {
            if (!r.ok) throw new Error(String(r.status))
            const svg = (r.headers.get('content-type') ?? '').includes('svg') || url.endsWith('.svg')
            return svg
              ? r.text().then((txt) => new Blob([/<svg[^>]*\swidth=/.test(txt) ? txt : txt.replace('<svg', '<svg width="128" height="128"')], { type: 'image/svg+xml' }))
              : r.blob()
          })
          .then(
            (b) =>
              new Promise<HTMLImageElement>((ok, fail) => {
                const src = URL.createObjectURL(b)
                blobs.push(src)
                const img = new Image()
                img.onload = () => ok(img)
                img.onerror = fail
                img.src = src
              }),
          )
        icons.set(url, p)
      }
      return p
    }
    const tokenFor = (tr: BrainTrade): Tok => {
      const up = tr.pnl >= 0
      const key = `${tr.icon ?? tr.label}|${up ? 1 : 0}`
      let t = toks.get(key)
      if (t) return t
      const cv = document.createElement('canvas')
      cv.width = cv.height = TEX
      const tex = track(new THREE.CanvasTexture(cv))
      tex.colorSpace = THREE.SRGBColorSpace
      t = { cv, tex, img: null, up, label: tr.label }
      toks.set(key, t)
      drawTok(t)
      if (tr.icon) {
        const tk = t
        loadIcon(tr.icon)
          .then((img) => {
            if (dead) return
            tk.img = img
            drawTok(tk)
          })
          .catch(() => {}) // нет иконки / сеть — остаются буквы тикера
      }
      return t
    }

    // ---------- нити между соседями ----------
    const linkMat = track(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.42, depthWrite: false }))
    const links = new THREE.LineSegments(new THREE.BufferGeometry(), linkMat)
    brain.add(links)
    const hlMat = track(new THREE.LineBasicMaterial({ color: C.primary, transparent: true, opacity: 0.9, depthWrite: false }))
    const hl = new THREE.LineSegments(new THREE.BufferGeometry(), hlMat)
    brain.add(hl)
    /** соседи каждого видимого нейрона (по индексу в nodes) */
    let nbr: number[][] = []
    let pairs: [number, number][] = []
    const shown = (n: Node) => n.userData.mode !== 'wait'
    const rebuildLinks = () => {
      const vis = nodes.map((n, i) => (shown(n) ? i : -1)).filter((i) => i >= 0)
      nbr = nodes.map(() => [])
      const seenPair = new Set<string>()
      pairs = []
      for (const i of vis) {
        const pi = nodes[i].position
        const near = vis
          .filter((j) => j !== i)
          .map((j) => ({ j, d: pi.distanceToSquared(nodes[j].position) }))
          .sort((a, b) => a.d - b.d)
          .slice(0, LINKS)
        for (const { j } of near) {
          const k = i < j ? `${i}-${j}` : `${j}-${i}`
          if (seenPair.has(k)) continue
          seenPair.add(k)
          pairs.push([i, j])
          nbr[i].push(j)
          nbr[j].push(i)
        }
      }
      const pos = new Float32Array(pairs.length * 6)
      const col = new Float32Array(pairs.length * 6)
      const tmp = new THREE.Color()
      pairs.forEach(([a, b], k) => {
        nodes[a].position.toArray(pos, k * 6)
        nodes[b].position.toArray(pos, k * 6 + 3)
        // нить — цветом своих концов, приглушённым к серому: плюс к плюсу — зеленоватая, минус к минусу — красноватая
        tmp.copy(nodes[a].userData.tr.pnl >= 0 ? C.up : C.down).lerp(C.muted, 0.55)
        tmp.toArray(col, k * 6)
        tmp.copy(nodes[b].userData.tr.pnl >= 0 ? C.up : C.down).lerp(C.muted, 0.55)
        tmp.toArray(col, k * 6 + 3)
      })
      links.geometry.dispose()
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      g.setAttribute('color', new THREE.BufferAttribute(col, 3))
      links.geometry = g
      hlFor = -1
    }
    let hlFor = -1
    const setHighlight = (i: number) => {
      if (i === hlFor) return
      hlFor = i
      const pts: number[] = []
      if (i >= 0)
        for (const j of nbr[i] ?? []) {
          pts.push(...nodes[i].position.toArray(), ...nodes[j].position.toArray())
        }
      hl.geometry.dispose()
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
      hl.geometry = g
    }

    // ---------- импульсы по нитям ----------
    const pulseGeo = track(new THREE.SphereGeometry(0.045, 10, 8))
    type Pulse = { m: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>; a: number; b: number; t0: number; dur: number; hop: number }
    const pulses: Pulse[] = []
    const MAX_PULSES = soft ? 24 : 70
    const pulse = (a: number, b: number, at: number, hop = 0, color?: THREE.Color) => {
      if (still || pulses.length >= MAX_PULSES || !nodes[a] || !nodes[b]) return
      const m = new THREE.Mesh(pulseGeo, new THREE.MeshBasicMaterial({ color: color ?? C.primary, transparent: true, opacity: 0, depthWrite: false, fog: false }))
      brain.add(m)
      pulses.push({ m, a, b, t0: at, dur: 650 + nodes[a].position.distanceTo(nodes[b].position) * 180, hop })
    }
    /** волна от нейрона: к соседям, потом дальше (hop — сколько ещё шагов) */
    const wave = (i: number, at: number, hops: number) => {
      const color = nodes[i].userData.tr.pnl >= 0 ? C.up : C.down
      for (const j of nbr[i] ?? []) pulse(i, j, at, hops, color)
    }
    // кольцо при вспышке нейрона
    const flashGeo = track(new THREE.RingGeometry(0.22, 0.232, 48))
    const flashes: { m: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>; t0: number }[] = []
    const flash = (n: Node, now: number) => {
      if (still) return
      const m = new THREE.Mesh(flashGeo, new THREE.MeshBasicMaterial({ color: C.primary, transparent: true, opacity: 0.6, depthWrite: false, fog: false }))
      n.getWorldPosition(m.position)
      scene.add(m)
      flashes.push({ m, t0: now })
    }

    // ---------- сделки пришли / поменялись ----------
    let first = true
    let growUntil = 0
    const queue: { at: number; id: string }[] = []
    let seen = ''
    const sync = (now: number) => {
      const list = live.current.trades
      const sig = list.map((x) => x.id + ':' + x.pnl).join('|')
      if (sig === seen) return
      seen = sig
      maxAbs = Math.max(1, ...list.map((x) => Math.abs(x.pnl)))
      const byId = new Map(nodes.map((n) => [n.userData.tr.id, n]))
      const next: Node[] = []
      const fresh: Node[] = []
      list.forEach((tr, i) => {
        let n = byId.get(tr.id)
        if (n) byId.delete(tr.id)
        else {
          const face = new THREE.MeshBasicMaterial({ map: tokenFor(tr).tex, transparent: true })
          const edge = new THREE.MeshBasicMaterial({ color: tr.pnl >= 0 ? C.up : C.down, transparent: true })
          n = new THREE.Group() as Node
          const front = new THREE.Mesh(faceGeo, face)
          front.position.z = COIN_T / 2
          const back = new THREE.Mesh(faceGeo, face)
          back.position.z = -COIN_T / 2
          back.rotation.y = Math.PI
          n.add(front, back, new THREE.Mesh(edgeGeo, edge))
          // соседние жетоны крутятся в разные стороны и с чуть разной скоростью
          const h = hash(tr.id, 7)
          const spin = (h < 0.5 ? 1 : -1) * (0.5 + hash(tr.id, 8) * 0.5)
          n.userData = { tr, i, size: 0, mode: 'still', t0: now, f: 1, hs: 1, spin, ang: h * 6.28, lit: false, face, edge }
          placeOf(tr.id, n.position)
          n.scale.setScalar(0.0001)
          brain.add(n)
          fresh.push(n)
        }
        n.userData.tr = tr
        n.userData.i = i
        n.userData.size = sizeOf(tr.pnl)
        n.userData.face.map = tokenFor(tr).tex
        n.userData.edge.color.copy(tr.pnl >= 0 ? C.up : C.down)
        next.push(n)
      })
      for (const n of byId.values()) {
        brain.remove(n)
        n.userData.face.dispose()
        n.userData.edge.dispose()
      }
      // импульсы старых индексов больше не верны
      for (const p of pulses) {
        brain.remove(p.m)
        p.m.material.dispose()
      }
      pulses.length = 0
      nodes = next
      const n = nodes.length
      if (first) {
        // первый показ: нейроны появляются от центра наружу; последние REPLAY — потом по одной, «зажигаясь»
        first = false
        const rep = still ? 0 : Math.min(REPLAY, Math.max(0, n - 4))
        growUntil = still ? now : now + 1500
        fresh.forEach((nd) => {
          const u = nd.userData
          if (u.i < n - rep) {
            u.mode = still ? 'still' : 'grow'
            u.t0 = now + (nd.position.length() / (R * 1.3)) * 1100
          } else {
            u.mode = 'wait'
            queue.push({ at: growUntil + 400 + (u.i - (n - rep)) * 650, id: u.tr.id })
          }
        })
        if (still) fresh.forEach((nd) => nd.scale.setScalar(1))
      } else {
        // новые сделки: последние (до 10) — по одной, «зажигаясь»; остальные (смена диапазона) — появляются сразу
        const latest = fresh.filter((nd) => nd.userData.i >= n - 10)
        let at = Math.max(now, queue.length ? queue[queue.length - 1].at + 650 : now) + (live.current.busy ? 900 : 0)
        fresh.forEach((nd) => {
          if (!still && latest.includes(nd) && n > 1) {
            nd.userData.mode = 'wait'
            queue.push({ at, id: nd.userData.tr.id })
            at += 650
          } else {
            nd.userData.mode = still ? 'still' : 'grow'
            nd.userData.t0 = now
          }
        })
      }
      rebuildLinks()
      host.dataset.brainCount = String(n)
    }

    const recolor = () => {
      C = readPalette()
      fog.color.copy(C.surface)
      hlMat.color.copy(C.primary)
      for (const t of toks.values()) drawTok(t)
      for (const nd of nodes) nd.userData.edge.color.copy(nd.userData.tr.pnl >= 0 ? C.up : C.down)
      rebuildLinks()
    }
    const mo = new MutationObserver(recolor)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette'] })

    // ---------- мышь и палец ----------
    const ray = new THREE.Raycaster()
    const ndc = new THREE.Vector2(9, 9)
    let inside = false
    let moved = true
    let drag: { x: number; y: number; moved: number; type: string } | null = null
    let yaw = 0
    let yawV = 0
    let pitch = 0
    let pitchV = 0
    // приближение: 0 — снаружи, 1 — внутри; колесо мыши / два пальца / кнопка «Войти внутрь»
    let zoom = 0
    let zoomT = 0
    let lastInner = false
    const pts = new Map<number, { x: number; y: number }>()
    let pinch = 0
    let hit: Node | null = null
    const setNdc = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      moved = true
    }
    const onMove = (e: PointerEvent) => {
      setNdc(e)
      inside = e.pointerType === 'mouse'
      if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pts.size === 2) {
        // два пальца: развёл — ближе (внутрь), свёл — дальше
        const [a, b] = [...pts.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        if (pinch) zoomT = Math.max(0, Math.min(1, zoomT + (d - pinch) / 260))
        pinch = d
        if (drag) drag.moved = 99
        return
      }
      if (drag) {
        const dx = e.clientX - drag.x
        const dy = e.clientY - drag.y
        drag.x = e.clientX
        drag.moved += Math.abs(dx) + Math.abs(dy)
        drag.y = e.clientY
        yawV = dx * 0.006
        yaw += yawV
        // внутри можно осматриваться и вверх-вниз
        if (zoom > 0.3) {
          pitchV = dy * 0.004
          pitch = Math.max(-1.1, Math.min(1.1, pitch + pitchV))
        }
      }
    }
    const onDown = (e: PointerEvent) => {
      setNdc(e)
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      pinch = 0
      drag = { x: e.clientX, y: e.clientY, moved: pts.size > 1 ? 99 : 0, type: e.pointerType }
    }
    const onUp = (e: PointerEvent) => {
      pts.delete(e.pointerId)
      pinch = 0
      const d = drag
      drag = null
      if (!d || d.moved > 6) return
      setNdc(e)
      const n = pick()
      if (!n) return setSel(null)
      const id = n.userData.tr.id
      // палец: первое касание — карточка, второе — сделка; мышь — сразу сделка
      if (d.type === 'mouse' || live.current.sel === id) live.current.onOpenTrade(id)
      else setSel(id)
    }
    const onLeave = () => {
      inside = false
      drag = null
      ndc.set(9, 9)
      moved = true
    }
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointerleave', onLeave)
    // колесо: вверх — ближе / внутрь, вниз — наружу; снаружи и дальше крутить вниз — прокручивается страница
    const onWheel = (e: WheelEvent) => {
      const next = Math.max(0, Math.min(1, zoomT - e.deltaY / 700))
      if (next === zoomT) return
      e.preventDefault()
      zoomT = next
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    const toggle = () => (zoomT = zoomT > 0.5 ? 0 : 1)
    host.addEventListener('brain-toggle', toggle)
    const pick = (): Node | null => {
      ray.setFromCamera(ndc, camera)
      const vis = nodes.filter((n) => n.scale.x > 0.05)
      return (ray.intersectObjects(vis, true)[0]?.object.parent as Node | undefined) ?? null
    }

    let visible = true
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting))
    io.observe(host)

    const v3 = new THREE.Vector3()
    const toScreen = (o: THREE.Object3D) => {
      o.getWorldPosition(v3).project(camera)
      return { x: ((v3.x + 1) / 2) * W, y: ((1 - v3.y) / 2) * size }
    }
    // перед камерой и не слишком далеко (снаружи — передняя половина облака, внутри — те, что впереди)
    const inFront = (o: THREE.Object3D) => {
      o.getWorldPosition(v3).applyMatrix4(camera.matrixWorldInverse)
      return v3.z < -0.6 && v3.z > -camera.position.length() - 0.2
    }
    let tiltX = 0
    let tiltY = 0
    let raf = 0
    let frame = 0
    let lastNow = performance.now()
    let lastTipId = ''
    let calm = false
    let wasBusy = false
    let nextAmbient = 0
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (!visible || document.hidden) return
      frame++
      // спокойная сцена — 30 кадров/с (без видеокарты — 20), пока что-то происходит — сколько может (без видеокарты — 30)
      if (frame % (calm ? (soft ? 3 : 2) : soft ? 2 : 1)) return
      sync(now)
      const dt = Math.min(0.05, (now - lastNow) / 1000)
      lastNow = now

      // очередь: сделка «зажигается» — появляется, кольцо, волна импульсов по сети
      let relink = false
      while (queue.length && queue[0].at <= now) {
        const q = queue.shift()!
        const n = nodes.find((x) => x.userData.tr.id === q.id)
        if (!n) continue
        n.userData.mode = 'arrive'
        n.userData.t0 = now
        n.userData.lit = false
        relink = true
      }
      if (relink) rebuildLinks()
      // «Обновить» — волна от центра наружу
      const b = live.current.busy
      if (b && !wasBusy && !still) {
        const order = nodes.map((n, i) => ({ i, d: n.position.length() })).sort((x, y) => x.d - y.d)
        for (const { i, d } of order) for (const j of nbr[i] ?? []) if (nodes[j].position.length() > d) pulse(i, j, now + d * 260, 0)
      }
      wasBusy = b
      // редкие импульсы всё время — сеть «живая»
      if (!still && now > growUntil && now >= nextAmbient && pairs.length) {
        const [a, c] = pairs[Math.floor(Math.random() * pairs.length)]
        if (Math.random() < 0.5) pulse(a, c, now)
        else pulse(c, a, now)
        nextAmbient = now + (soft ? 900 : 420) + Math.random() * 500
      }

      if (!drag) {
        yawV *= 0.94
        yaw += yawV
        pitchV *= 0.9
        // вращается само (внутри — медленнее); навёл на нейрон или выбрал биржу — замирает, чтобы было удобно смотреть
        if (!still && !hit && !live.current.sel && !live.current.focus) yaw += AUTO_SPIN * dt * (1 - zoom * 0.6)
      }
      zoom += (zoomT - zoom) * (still ? 1 : 0.07)
      if (zoom < 0.3) pitch *= 0.92 // снаружи — обратно ровно
      const inn = zoomT > 0.5
      if (inn !== lastInner) {
        lastInner = inn
        setInner(inn)
      }
      host.dataset.brainZoom = zoom > 0.5 ? 'in' : 'out'
      const tx = inside ? ndc.y * 0.08 : 0
      const ty = inside ? ndc.x * 0.12 : 0
      tiltX += (tx - tiltX) * 0.05
      tiltY += (ty - tiltY) * 0.05
      brain.rotation.y = yaw
      brain.rotation.x = pitch
      const dist = CAM_D + (CAM_IN - CAM_D) * easeOut(zoom)
      const el = 0.22 * (1 - zoom) + tiltX
      camera.position.set(Math.sin(tiltY) * dist * Math.cos(el), Math.sin(el) * dist, Math.cos(tiltY) * dist * Math.cos(el))
      camera.lookAt(LOOK)
      // внутри — шире угол обзора (видно сделки вокруг), туман — от камеры: снаружи дальние тише, внутри — видно весь «мозг» вокруг
      const zk = easeOut(zoom)
      const fov = 30 + 42 * zk
      if (Math.abs(camera.fov - fov) > 0.01) {
        camera.fov = fov
        camera.updateProjectionMatrix()
      }
      fog.near = dist - 2.5 + (1.5 - (dist - 2.5)) * zk
      fog.far = dist + 4 + (9.5 - (dist + 4)) * zk
      scene.updateMatrixWorld()
      faceCam.copy(brain.quaternion).invert().multiply(camera.quaternion)

      // наведение: мышь (раз в 2 кадра и при движении — сеть двигается под мышью), иначе — выбранная пальцем / с клавиатуры
      if (drag && drag.moved > 6) hit = null
      else if (moved || frame % 2 === 0) {
        hit = inside ? pick() : null
        moved = false
      }
      const selId = live.current.sel
      const target = hit ?? (selId ? nodes.find((n) => n.userData.tr.id === selId) ?? null : null)
      const focusEx = target ? null : live.current.focus
      canvas.style.cursor = hit ? 'pointer' : drag ? 'grabbing' : 'grab'
      setHighlight(target ? nodes.indexOf(target) : -1)
      linkMat.opacity += ((target || focusEx ? 0.14 : C.light ? 0.5 : 0.42) - linkMat.opacity) * 0.15

      for (const n of nodes) {
        const u = n.userData
        let s = u.size
        if (u.mode === 'wait') s = 0.0001
        else if (u.mode === 'grow') {
          const k = (now - u.t0) / 520
          s *= k <= 0 ? 0.0001 : Math.max(0.0001, Math.min(1.06, spring(Math.min(1, k))))
          if (k >= 1) u.mode = 'still'
        } else if (u.mode === 'arrive') {
          const k = Math.min(1, (now - u.t0) / 700)
          s *= Math.max(0.0001, spring(k)) * (1 + Math.sin(k * Math.PI) * 0.25)
          if (!u.lit && k > 0.25) {
            u.lit = true
            flash(n, now)
            wave(nodes.indexOf(n), now, 1)
          }
          if (k >= 1) u.mode = 'still'
        }
        const isHit = n === target
        u.hs += ((isHit ? 1.35 : 1) - u.hs) * 0.2
        n.scale.setScalar(s * u.hs)
        // лицом к зрителю + вращение вокруг своей оси; под мышью — плавно разворачивается иконкой к тебе
        if (isHit || still) u.ang += (Math.round(u.ang / (Math.PI * 2)) * Math.PI * 2 - u.ang) * (still ? 1 : 0.15)
        else u.ang += u.spin * dt
        n.quaternion.copy(faceCam).multiply(spinQ.setFromAxisAngle(Y_AXIS, u.ang))
        const nb = target ? nbr[nodes.indexOf(target)] ?? [] : []
        const on = focusEx ? u.tr.exchange === focusEx : !target || isHit || nb.includes(u.i) ? 1 : 0.3
        u.f += (Number(on) - u.f) * 0.15
        // дальние от камеры — тише, не в фокусе — ещё тише
        const dc = n.getWorldPosition(v3).distanceTo(camera.position)
        const depth = Math.min(1, Math.max(0, 1 - (dc - (dist - R)) / (2 * R)))
        const op = (0.4 + 0.6 * depth) * (0.2 + 0.8 * u.f)
        u.face.opacity = op
        u.edge.opacity = op
      }
      // импульсы: бегут по нити, дошли — на следующем шаге волны расходятся дальше
      for (let k = pulses.length - 1; k >= 0; k--) {
        const p = pulses[k]
        const kk = (now - p.t0) / p.dur
        if (kk < 0) continue
        if (kk >= 1 || !nodes[p.a] || !nodes[p.b]) {
          brain.remove(p.m)
          p.m.material.dispose()
          pulses.splice(k, 1)
          if (kk >= 1 && p.hop > 0 && nodes[p.b])
            for (const j of nbr[p.b] ?? []) if (j !== p.a) pulse(p.b, j, now, p.hop - 1, p.m.material.color)
          continue
        }
        p.m.position.lerpVectors(nodes[p.a].position, nodes[p.b].position, easeOut(kk))
        p.m.material.opacity = Math.sin(Math.PI * kk) * 0.95
      }
      for (let k = flashes.length - 1; k >= 0; k--) {
        const f = flashes[k]
        const kk = (now - f.t0) / 850
        f.m.lookAt(camera.position)
        f.m.scale.setScalar(1 + easeOut(Math.min(1, kk)) * 1.3)
        f.m.material.opacity = 0.6 * (1 - Math.min(1, kk))
        if (kk > 1) {
          scene.remove(f.m)
          f.m.material.dispose()
          flashes.splice(k, 1)
        }
      }

      renderer.render(scene, camera)
      calm =
        now > growUntil + 800 && !queue.length && !flashes.length && !drag && !inside && !target && !focusEx && Math.abs(yawV) < 0.0005 && Math.abs(zoomT - zoom) < 0.01

      // подписи четырёх последних сделок — только у тех, что спереди (сзади слипаются)
      const order = nodes
        .filter((n) => n.userData.mode === 'still' && n.scale.x > 0.05 && inFront(n))
        .sort((a, b) => b.userData.i - a.userData.i)
      gls.forEach((el, k) => {
        const n = order[k]
        if (!n || target || focusEx) {
          el.style.opacity = '0'
          return
        }
        const u = n.userData
        const p = toScreen(n)
        if (el.dataset.k !== u.tr.id) {
          el.innerHTML = `<span class="${u.tr.pnl >= 0 ? 'text-up' : 'text-down'} num">${formatPnlShort(u.tr.pnl)}</span><span class="font-medium text-muted">${esc(u.tr.label)}</span>`
          el.dataset.k = u.tr.id
        }
        el.style.transform = `translate(${p.x}px, ${p.y - u.size * 46 * u.hs}px) translate(-50%, -100%)`
        el.style.opacity = String([1, 0.8, 0.62, 0.45][k] * Math.min(1, u.f))
      })
      // карточка сделки — целиком в сцене: сверху от жетона, если помещается, иначе снизу; по бокам не вылезает
      if (target) {
        const tr = target.userData.tr
        if (lastTipId !== tr.id) {
          lastTipId = tr.id
          const logo = exchangeLogoUrl(tr.exchange)
          tip.innerHTML =
            `<div class="flex items-center gap-2 font-semibold">${logo ? `<img src="${logo}" alt="" class="size-[18px] rounded-[5px]">` : ''}${esc(tr.symbol)} · ${esc(tr.side)}</div>` +
            `<div class="num mt-0.5 font-bold ${tr.pnl >= 0 ? 'text-up' : 'text-down'}">${formatPnl(tr.pnl)}</div>` +
            `<div class="mt-0.5 text-muted">${esc(tr.exName)} · ${esc(tr.when)}</div>`
        }
        const p = toScreen(target)
        const tw = tip.offsetWidth
        const th = tip.offsetHeight
        const gap = target.userData.size * 46 * target.userData.hs + 10
        const x = Math.max(tw / 2 + 8, Math.min(W - tw / 2 - 8, p.x))
        const above = p.y - gap - th >= 8
        const y = above ? p.y - gap - th : Math.min(size - th - 8, p.y + gap)
        tip.style.transform = `translate(${x - tw / 2}px, ${y}px)`
        tip.style.opacity = '1'
        host.dataset.brainHover = tr.id
      } else {
        tip.style.opacity = '0'
        lastTipId = ''
        delete host.dataset.brainHover
      }
    }
    raf = requestAnimationFrame(tick)
    host.dataset.brainReady = ''

    return () => {
      cancelAnimationFrame(raf)
      mo.disconnect()
      io.disconnect()
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('wheel', onWheel)
      host.removeEventListener('brain-toggle', toggle)
      dead = true
      blobs.forEach((u) => URL.revokeObjectURL(u))
      ;[...gls, tip].forEach((el) => el.remove())
      for (const n of nodes) {
        n.userData.face.dispose()
        n.userData.edge.dispose()
      }
      for (const p of pulses) p.m.material.dispose()
      for (const f of flashes) f.m.material.dispose()
      links.geometry.dispose()
      hl.geometry.dispose()
      disposables.forEach((d) => d.dispose())
      renderer.dispose()
      canvas.remove()
      delete host.dataset.brainReady
    }
  }

  // для клавиатуры и дикторов — последние сделки кнопками; фокус = наведение
  const recent = trades.slice(-12).reverse()
  return (
    <div ref={wrap} data-brain role="group" aria-label={labels.scene} className="relative overflow-hidden" style={{ width: W, height: size, maxWidth: '100%' }}>
      <button
        type="button"
        data-brain-refresh
        onClick={onRefresh}
        disabled={busy}
        className="absolute bottom-3 left-3 z-[3] flex h-8 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-xs font-semibold transition-colors hover:border-primary disabled:opacity-70"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className={`size-3.5 ${busy ? 'animate-spin' : ''}`} aria-hidden>
          <path d="M20 12a8 8 0 1 1-2.34-5.66" />
          <path d="M20 4v5h-5" />
        </svg>
        {labels.refresh}
      </button>
      {/* зайти внутрь «мозга» и обратно (то же — колесом мыши / двумя пальцами) */}
      {trades.length > 0 && (
        <button
          type="button"
          data-brain-enter
          aria-pressed={inner}
          onClick={() => wrap.current?.dispatchEvent(new Event('brain-toggle'))}
          className={`absolute right-3 top-3 z-[3] flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors hover:border-primary ${inner ? 'border-primary bg-primary/12' : 'border-border bg-surface'}`}
        >
          {inner ? labels.exit : labels.enter}
        </button>
      )}
      {!trades.length && <p className="absolute inset-x-0 top-[38%] z-[2] px-6 text-center text-sm text-muted">{labels.empty}</p>}
      <ul className="sr-only">
        {recent.map((tr) => (
          <li key={tr.id}>
            <button
              type="button"
              data-brain-trade={tr.id}
              onFocus={() => setSel(tr.id)}
              onBlur={() => setSel((s) => (s === tr.id ? null : s))}
              onClick={() => onOpenTrade(tr.id)}
            >
              {`${tr.symbol} ${tr.side} ${formatPnl(tr.pnl)} · ${tr.exName} · ${tr.when}`}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
