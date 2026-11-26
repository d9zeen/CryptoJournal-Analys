/**
 * «Мозг из сделок» на странице «Биржи» (владелец 26.11.2026: «как нейронные связки» → «Мозг из сделок», «хочу зайти в этот мозг и клацать внутри»;
 * вторая версия — владелец: «слишком большие токены», «не нравятся фишки», «все сделки за всё время» и «анимация, как строятся нейроны при выгрузке сделок с биржи»).
 *
 * Каждая сделка — маленький светящийся нейрон (фиолетовая схема, владелец 26.11.2026: плюс — яркий --color-primary, минус — серый; чуть крупнее — больше сумма), без жетонов и картинок в сцене.
 * Нейроны одной монеты собраны в своё «полушарие» (центр — из тикера, место нейрона — из id сделки: при новых сделках остальные не прыгают).
 * Связи: каждая сделка — с предыдущей сделкой (нить времени) и с предыдущей сделкой той же монеты.
 *  - при открытии сеть «вырастает» по порядку сделок: нейрон загорается, к нему тянется связь, искра бежит по новой нити;
 *  - сделки, пришедшие с биржи (синхронизация, «Обновить»), достраивают сеть так же — по одной, с искрой;
 *  - всё время по связям бегут редкие импульсы; мозг медленно вращается сам; потянуть — повернуть с инерцией;
 *  - наведение на нейрон — карточка сделки (монета, сумма, биржа, время), его связи подсвечены, остальное тише, вращение замирает; клик — страница сделки;
 *  - подписи монет у самых больших «полушарий»; наведение на биржу в списке рядом (focus) — горят только её сделки;
 *  - «Войти внутрь» / колесо мыши вверх / два пальца — камера в центр, шире угол обзора, тянуть — осматриваться и нажимать на сделки вокруг.
 * Тысячи сделок: нейроны — один InstancedMesh, свечение — Points, связи — одни LineSegments; матрицы и цвета обновляются только когда что-то меняется.
 * Палец: касание — карточка, второе — сделка. Клавиатура и дикторы — скрытые кнопки последних сделок (data-brain-trade): фокус = наведение, Enter — сделка.
 * «Уменьшить движение» — сеть сразу целиком, без вращения и импульсов. Вне экрана и в фоновой вкладке не рисуем; пиксели ≤ 1,5×;
 * сцена строится, когда страница свободна; без видеокарты (SwiftShader / llvmpipe) — пиксели 1×, реже кадры, меньше импульсов. Цвета — токены theme.css.
 */
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { exchangeLogoUrl } from '@/components/ExchangeLogo'
import { formatPnl } from '@/lib/format'

export type BrainTrade = {
  id: string
  exchange: string
  /** название биржи для подсказки */
  exName: string
  /** монета: BTC — по ней «полушария» и подписи */
  label: string
  /** полностью для подсказки: BTCUSDT */
  symbol: string
  /** Long / Short */
  side: string
  pnl: number
  /** «сегодня, 14:05» — для подсказки */
  when: string
  /** иконка монеты для карточки сделки; нет — без неё */
  icon: string | null
  /** цвет монеты (из её логотипа, coins.color) — для схемы «по монетам» */
  color?: string | null
}

/** цветовая схема: по результату (плюс / минус), по монетам (цвет логотипа; минус — тусклее), фиолетовая (по умолчанию: плюс — яркий цвет кнопок, минус — серый), мятная */
export type BrainScheme = 'result' | 'coin' | 'mono' | 'accent'

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
  labels: { scene: string; refresh: string; empty: string; enter: string; exit: string; wheel: string }
  /** WebGL недоступен — нарисовать запасной вариант */
  onFail?: () => void
  scheme?: BrainScheme
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
  text: tokenColor('--color-text'),
  primary: tokenColor('--color-primary'),
  accent: tokenColor('--color-accent'),
  light: document.documentElement.dataset.theme === 'light',
})
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** радиус облака и его вытянутость (как мозг: шире, чем выше) */
const R = 2.4
const SHAPE = new THREE.Vector3(1.32, 0.9, 1.05)
const CAM_D = 10.2
/** камера внутри «мозга» */
const CAM_IN = 0.9
/** самовращение, рад/с — оборот примерно за 50 с */
const AUTO_SPIN = 0.12
const easeOut = (k: number) => 1 - Math.pow(1 - k, 3)
const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2)

/** хеш строки → [0, 1) */
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
const dirOf = (key: string, s1: number, s2: number, out: THREE.Vector3) => {
  const u = hash(key, s1) * 2 - 1
  const phi = hash(key, s2) * Math.PI * 2
  const s = Math.sqrt(1 - u * u)
  return out.set(s * Math.cos(phi), u, s * Math.sin(phi))
}
/** центр «доли» монеты: доли ровно по сфере (точки Фибоначчи) в порядке появления монет; больше 30 монет — вторым, внутренним слоем */
function lobeCenter(c: number, total: number, out: THREE.Vector3): THREE.Vector3 {
  const slots = Math.max(6, Math.min(30, total))
  const k = c % slots
  const y = 1 - (2 * (k + 0.5)) / slots
  const r = Math.sqrt(1 - y * y)
  const phi = k * 2.399963 // золотой угол
  return out.set(r * Math.cos(phi), y, r * Math.sin(phi)).multiplyScalar(R * (c < slots ? 0.72 : 0.42)).multiply(SHAPE)
}
/** место нейрона: центр доли своей монеты + разброс по id сделки (плотнее к центру доли) */
function placeOf(tr: BrainTrade, center: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const off = dirOf(tr.id, 1, 2, new THREE.Vector3()).multiplyScalar(R * 0.3 * Math.pow(hash(tr.id, 3), 0.6))
  return out.copy(center).add(off.multiply(SHAPE))
}

export function TradeBrain3D({ trades, size, focus, busy, onOpenTrade, onRefresh, labels, onFail, scheme: schemeProp }: Props) {
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
  const wheelLabel = labels.wheel

  useEffect(() => {
    const host = wrap.current
    if (!host) return
    // сцену строим, когда страница свободна (не мешаем подключению биржи, загрузке списков)
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
    // схема цвета: по умолчанию фиолетовая (владелец 26.11.2026 из четырёх: по результату, по монетам, фиолетовая, мятная)
    const scheme: BrainScheme = schemeProp ?? 'mono'
    const disposables: { dispose: () => void }[] = []
    const track = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x)

    const scene = new THREE.Scene()
    const fog = new THREE.Fog(C.surface, 8.5, 15)
    scene.fog = fog
    const camera = new THREE.PerspectiveCamera(30, W / size, 0.05, 60)
    const brain = new THREE.Group()
    scene.add(brain)

    // HTML поверх сцены: подписи «полушарий» и карточка сделки
    const mk = (cls: string) => {
      const el = document.createElement('div')
      el.className = cls
      el.setAttribute('aria-hidden', 'true')
      host.appendChild(el)
      return el
    }
    const clusterEls = Array.from({ length: small ? 3 : 6 }, () =>
      mk('pointer-events-none absolute left-0 top-0 z-[2] whitespace-nowrap rounded-md bg-surface/70 px-1.5 py-0.5 text-xs font-semibold text-muted transition-opacity duration-300'),
    )
    const tip = mk('pointer-events-none absolute left-0 top-0 z-[5] whitespace-nowrap rounded-xl border border-border bg-surface px-3 py-2.5 text-sm opacity-0 shadow-lg transition-opacity duration-150')
    tip.dataset.brainTip = ''

    // ---------- нейроны: ядро — InstancedMesh, свечение — Points; связи внутри «полушария» и «аксоны» между ними ----------
    const nodeGeo = track(new THREE.IcosahedronGeometry(1, 1))
    const nodeMat = track(new THREE.MeshBasicMaterial())
    let cap = 0
    let inst: THREE.InstancedMesh | null = null
    const glowTex = (() => {
      const cv = document.createElement('canvas')
      cv.width = cv.height = 64
      const x = cv.getContext('2d')!
      const g = x.createRadialGradient(32, 32, 0, 32, 32, 32)
      g.addColorStop(0, 'rgba(255,255,255,0.9)')
      g.addColorStop(0.18, 'rgba(255,255,255,0.35)')
      g.addColorStop(0.5, 'rgba(255,255,255,0.08)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      x.fillStyle = g
      x.fillRect(0, 0, 64, 64)
      return track(new THREE.CanvasTexture(cv))
    })()
    // свечение: на тёмной — сложением света (светится), на светлой — обычной прозрачностью (иначе не видно)
    const glowMat = track(new THREE.PointsMaterial({ size: 0.22, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true }))
    const glow = new THREE.Points(new THREE.BufferGeometry(), glowMat)
    brain.add(glow)
    // ядра «полушарий» (монет) — крупное мягкое свечение цвета кнопок
    const somaMat = track(new THREE.PointsMaterial({ size: 0.9, map: glowTex, transparent: true, depthWrite: false, sizeAttenuation: true }))
    const somas = new THREE.Points(new THREE.BufferGeometry(), somaMat)
    brain.add(somas)
    const linkMat = track(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false }))
    const links = new THREE.LineSegments(new THREE.BufferGeometry(), linkMat)
    brain.add(links)
    const axonMat = track(new THREE.LineBasicMaterial({ transparent: true, opacity: 0.28, depthWrite: false }))
    const axons = new THREE.LineSegments(new THREE.BufferGeometry(), axonMat)
    brain.add(axons)
    const hlMat = track(new THREE.LineBasicMaterial({ transparent: true, opacity: 0.95, depthWrite: false }))
    const hl = new THREE.LineSegments(new THREE.BufferGeometry(), hlMat)
    brain.add(hl)
    /** цвет ядер, аксонов и примеси в связях: у мятной схемы — мята, у остальных — цвет кнопок */
    const hub = () => (scheme === 'accent' ? C.accent : C.primary)
    const blendFor = () => (C.light ? THREE.NormalBlending : THREE.AdditiveBlending)
    const paintMats = () => {
      glowMat.blending = somaMat.blending = linkMat.blending = axonMat.blending = blendFor()
      glowMat.opacity = C.light ? 0.35 : 0.85
      somaMat.opacity = C.light ? 0.3 : 0.45
      somaMat.color.copy(hub())
      axonMat.color.copy(hub())
      axonMat.opacity = C.light ? 0.4 : 0.42
      hlMat.color.copy(C.primary)
      for (const m of [glowMat, somaMat, linkMat, axonMat]) m.needsUpdate = true
    }

    type N = { tr: BrainTrade; p: THREE.Vector3; r: number; c: number; nb: number[]; next: number[] }
    type Cl = { label: string; first: number; n: number; p: THREE.Vector3; members: number[] }
    let nodes: N[] = []
    let cls: Cl[] = []
    let maxAbs = 1
    /** сколько связей у первых i нейронов (для drawRange во время роста) */
    let edgeAt: number[] = [0]
    let edgeList: [number, number][] = []
    /** «аксоны» между ядрами: появляются, когда появились оба «полушария» */
    let axonList: { a: number; b: number; at: number; pts: THREE.Vector3[] }[] = []
    let axonShown = -1
    const radiusOf = (pnl: number) => 0.016 + 0.026 * Math.sqrt(Math.min(1, Math.abs(pnl) / maxAbs))

    // рост сети: grown — сколько нейронов уже «выросло» (дробное), growTo — до скольких растём, speed — нейронов в секунду
    let grown = 0
    let growTo = 0
    let speed = 1
    let shownCount = -1
    type Spark = { from: THREE.Vector3; to: THREE.Vector3; t0: number; dur: number; m: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>; path?: THREE.Vector3[] }
    const sparks: Spark[] = []
    const sparkGeo = track(new THREE.SphereGeometry(0.028, 10, 8))
    const MAX_SPARKS = soft ? 24 : 90
    const addSpark = (from: THREE.Vector3, to: THREE.Vector3, at: number, color: THREE.Color, path?: THREE.Vector3[]) => {
      if (still || sparks.length >= MAX_SPARKS) return
      const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: blendFor() }))
      brain.add(m)
      sparks.push({ from, to, t0: at, dur: (path ? 900 : 380) + from.distanceTo(to) * (path ? 220 : 160), m, path })
    }
    const spark = (a: number, b: number, at: number, color?: THREE.Color) => {
      if (!nodes[a] || !nodes[b]) return
      addSpark(nodes[a].p, nodes[b].p, at, color ?? C.primary)
    }
    const axonSpark = (k: number, at: number, rev = false) => {
      const ax = axonList[k]
      if (!ax) return
      const path = rev ? [...ax.pts].reverse() : ax.pts
      addSpark(path[0], path[path.length - 1], at, C.primary, path)
    }

    const mtx = new THREE.Matrix4()
    const qI = new THREE.Quaternion()
    const sv = new THREE.Vector3()
    const col = new THREE.Color()
    let dimFor: (i: number) => number = () => 1
    /** ядро нейрона: цвет результата, смягчённый к цвету текста (сигнал виден, но без «ёлочной гирлянды»); не в фокусе — к фону */
    /** основной цвет нейрона по схеме; во всех схемах, кроме «по результату», минус — тусклее (к фону) */
    const coinCol = new Map<string, THREE.Color>()
    const baseOf = (i: number, out: THREE.Color) => {
      const tr = nodes[i].tr
      const win = tr.pnl >= 0
      if (scheme === 'result') return out.copy(win ? C.up : C.down)
      if (scheme === 'coin') {
        let c = coinCol.get(tr.label)
        if (!c) {
          c = tr.color ? new THREE.Color().setStyle(tr.color, THREE.SRGBColorSpace) : C.primary.clone()
          coinCol.set(tr.label, c)
        }
        out.copy(c)
      } else out.copy(scheme === 'accent' ? C.accent : C.primary)
      return win ? out : out.lerp(C.muted, 0.55).lerp(C.surface, 0.35)
    }
    const colorOf = (i: number, out: THREE.Color) =>
      baseOf(i, out)
        .lerp(C.text, C.light ? 0.18 : 0.28)
        .lerp(C.surface, (1 - dimFor(i)) * 0.85)
    /** свечение — чистый цвет, тише */
    const glowOf = (i: number, out: THREE.Color) => baseOf(i, out).lerp(C.surface, (1 - dimFor(i)) * 0.92)
    let hoverI = -1
    let nearFade = 0
    const camLocal = new THREE.Vector3()
    /** размер нейрона: по сумме, пока растёт — с «вдохом», под мышью — крупнее; внутри мозга ближние к камере тают */
    const scaleAt = (i: number) => {
      if (i >= grown) return 0
      const k = Math.min(1, (grown - i) / 6)
      const pop = k < 1 ? easeOut(k) * (1 + Math.sin(k * Math.PI) * 0.8) : 1
      let s = nodes[i].r * pop * (i === hoverI ? 2.4 : 1)
      if (nearFade > 0) {
        const d = nodes[i].p.distanceTo(camLocal)
        s *= 1 - nearFade * (1 - Math.min(1, Math.max(0, (d - 0.35) / 1.1)))
      }
      return s
    }
    const writeNode = (i: number) => {
      if (!inst) return
      const s = scaleAt(i)
      mtx.compose(nodes[i].p, qI, sv.set(s, s, s))
      inst.setMatrixAt(i, mtx)
    }
    const recolorAll = () => {
      if (!inst) return
      const gc = glow.geometry.getAttribute('color') as THREE.BufferAttribute | undefined
      for (let i = 0; i < nodes.length; i++) {
        inst.setColorAt(i, colorOf(i, col))
        if (gc) {
          glowOf(i, col)
          gc.setXYZ(i, col.r, col.g, col.b)
        }
      }
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true
      if (gc) gc.needsUpdate = true
      // связи — цветом концов, сильно приглушённым к цвету кнопок
      const lc = links.geometry.getAttribute('color') as THREE.BufferAttribute | undefined
      if (lc) {
        const mix = new THREE.Color()
        edgeList.forEach(([a, b], k) => {
          glowOf(a, col).lerp(hub(), 0.55)
          mix.copy(col)
          lc.setXYZ(k * 2, mix.r, mix.g, mix.b)
          glowOf(b, col).lerp(hub(), 0.55)
          lc.setXYZ(k * 2 + 1, col.r, col.g, col.b)
        })
        lc.needsUpdate = true
      }
    }

    /** собрать всю сеть заново (сделки поменялись) */
    const build = (list: BrainTrade[]) => {
      maxAbs = Math.max(1, ...list.map((x) => Math.abs(x.pnl)))
      const byLabel = new Map<string, number>()
      cls = []
      const total = new Set(list.map((x) => x.label)).size
      nodes = list.map((tr, i) => {
        let c = byLabel.get(tr.label)
        if (c === undefined) {
          c = cls.length
          byLabel.set(tr.label, c)
          cls.push({ label: tr.label, first: i, n: 0, p: lobeCenter(c, total, new THREE.Vector3()), members: [] })
        }
        const cl = cls[c]
        // связи — с двумя ближайшими более ранними сделками той же монеты (дендриты), первая — с ядром «полушария»
        const p = placeOf(tr, cl.p, new THREE.Vector3())
        const cand = cl.members.slice(-160)
        const nb = cand
          .map((j) => ({ j, d: nodes[j].p.distanceToSquared(p) }))
          .sort((x, y) => x.d - y.d)
          .slice(0, 2)
          .map((x) => x.j)
        const n: N = { tr, p, r: radiusOf(tr.pnl), c, nb, next: [] }
        cl.members.push(i)
        cl.n++
        nodes[i] = n
        return n
      })
      edgeList = []
      edgeAt = [0]
      nodes.forEach((n, i) => {
        for (const j of n.nb) {
          edgeList.push([j, i])
          nodes[j].next.push(i)
        }
        edgeAt.push(edgeList.length)
      })
      // аксоны: каждое ядро — с двумя ближайшими другими, дугой через глубину мозга
      axonList = []
      const seenAx = new Set<string>()
      cls.forEach((a, ia) => {
        cls
          .map((b, ib) => ({ ib, d: a.p.distanceToSquared(b.p) }))
          .filter((x) => x.ib !== ia)
          .sort((x, y) => x.d - y.d)
          .slice(0, 2)
          .forEach(({ ib }) => {
            const key = ia < ib ? `${ia}-${ib}` : `${ib}-${ia}`
            if (seenAx.has(key)) return
            seenAx.add(key)
            const b = cls[ib]
            const ctrl = a.p.clone().add(b.p).multiplyScalar(0.5 * 0.35)
            const curve = new THREE.QuadraticBezierCurve3(a.p.clone(), ctrl, b.p.clone())
            axonList.push({ a: ia, b: ib, at: Math.max(a.first, b.first), pts: curve.getPoints(18) })
          })
      })
      axonList.sort((x, y) => x.at - y.at)
      axonShown = -1
      // InstancedMesh — с запасом, чтобы не пересоздавать на каждую новую сделку
      if (!inst || nodes.length > cap) {
        if (inst) {
          brain.remove(inst)
          inst.dispose()
        }
        cap = Math.max(64, Math.ceil(nodes.length * 1.25))
        inst = new THREE.InstancedMesh(nodeGeo, nodeMat, cap)
        inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        inst.frustumCulled = false
        brain.add(inst)
      }
      inst.count = nodes.length
      const gp = new Float32Array(nodes.length * 3)
      nodes.forEach((n, i) => n.p.toArray(gp, i * 3))
      glow.geometry.dispose()
      const gg = new THREE.BufferGeometry()
      gg.setAttribute('position', new THREE.BufferAttribute(gp, 3))
      gg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nodes.length * 3), 3))
      glow.geometry = gg
      const lp = new Float32Array(edgeList.length * 6)
      edgeList.forEach(([a, b], k) => {
        nodes[a].p.toArray(lp, k * 6)
        nodes[b].p.toArray(lp, k * 6 + 3)
      })
      links.geometry.dispose()
      const lg = new THREE.BufferGeometry()
      lg.setAttribute('position', new THREE.BufferAttribute(lp, 3))
      lg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(edgeList.length * 6), 3))
      links.geometry = lg
      // ядра — в порядке появления «полушарий» (cls уже по первой сделке): drawRange по числу появившихся
      const sp = new Float32Array(cls.length * 3)
      cls.forEach((c, k) => c.p.toArray(sp, k * 3))
      somas.geometry.dispose()
      const sg = new THREE.BufferGeometry()
      sg.setAttribute('position', new THREE.BufferAttribute(sp, 3))
      somas.geometry = sg
      hlFor = -2
      recolorAll()
      for (let i = 0; i < nodes.length; i++) writeNode(i)
      inst.instanceMatrix.needsUpdate = true
      buildClusters()
      host.dataset.brainCount = String(nodes.length)
    }
    /** аксоны, у которых уже появились оба «полушария» */
    const showAxons = (g: number, now: number) => {
      const n = axonList.filter((x) => x.at < g).length
      if (n === axonShown) return
      axonShown = n
      const arr: number[] = []
      for (let k = 0; k < n; k++) {
        const p = axonList[k].pts
        for (let i = 0; i < p.length - 1; i++) arr.push(p[i].x, p[i].y, p[i].z, p[i + 1].x, p[i + 1].y, p[i + 1].z)
      }
      axons.geometry.dispose()
      const g2 = new THREE.BufferGeometry()
      g2.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3))
      axons.geometry = g2
      // только что появившийся аксон — искра по нему
      if (n > 0 && grown < growTo) axonSpark(n - 1, now)
    }

    // подписи у самых больших «полушарий»
    let clusters: { label: string; n: number; c: THREE.Vector3; first: number }[] = []
    const buildClusters = () => {
      clusters = [...cls]
        .sort((a, b) => b.n - a.n)
        .slice(0, clusterEls.length)
        .map((c) => ({ label: c.label, n: c.n, c: c.p, first: c.first }))
      clusterEls.forEach((el, k) => {
        const c = clusters[k]
        el.textContent = c ? `${c.label} · ${c.n}` : ''
      })
    }

    // подсветка связей нейрона под мышью
    let hlFor = -2
    const setHighlight = (i: number) => {
      if (i === hlFor) return
      hlFor = i
      const pts: number[] = []
      if (i >= 0) {
        const n = nodes[i]
        for (const j of [...n.nb, ...n.next]) if (j >= 0 && j < grown) pts.push(...n.p.toArray(), ...nodes[j].p.toArray())
        // и путь к ядру своей монеты
        pts.push(...n.p.toArray(), ...cls[n.c].p.toArray())
      }
      hl.geometry.dispose()
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
      hl.geometry = g
    }

    // ---------- сделки пришли / поменялись ----------
    let seen: string[] = []
    let first = true
    const sync = (now: number) => {
      const list = live.current.trades
      if (list.length === seen.length && list.every((x, i) => x.id === seen[i])) return
      const old = seen
      seen = list.map((x) => x.id)
      // те же сделки + новые в конце (пришли с биржи) — достраиваем; иначе (другой диапазон) — растим заново, быстро
      const appended = !first && old.length > 0 && old.length < list.length && old.every((id, i) => id === seen[i])
      const before = Math.min(grown, list.length)
      build(list)
      if (still) {
        grown = growTo = nodes.length
      } else if (first || !appended) {
        grown = 0
        growTo = nodes.length
        // вся сеть вырастает за 2,5–6 с, сколько бы ни было сделок
        speed = Math.max(nodes.length / 6, Math.min(nodes.length / 2.5, 40)) || 1
      } else {
        grown = before
        growTo = nodes.length
        // пришедшие с биржи — по одной (видно, как каждая встаёт на место), много — быстрее
        speed = Math.max(2.5, (growTo - grown) / 4)
      }
      first = false
      void now
    }

    const recolor = () => {
      C = readPalette()
      fog.color.copy(C.surface)
      paintMats()
      recolorAll()
    }
    paintMats()
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
    let zoom = 0
    let zoomT = 0
    let lastInner = false
    const pts = new Map<number, { x: number; y: number }>()
    let pinch = 0
    let hit = -1
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
        if (zoom > 0.3) {
          pitchV = dy * 0.004
          pitch = Math.max(-1.1, Math.min(1.1, pitch + pitchV))
        }
      }
    }
    const onDown = (e: PointerEvent) => {
      setNdc(e)
      // клик по сцене «включает» колесо (владелец 26.11.2026): до клика колесо прокручивает страницу, а не приближает
      armed = true
      wheelHint.style.opacity = '0'
      host.dataset.brainWheel = 'on'
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
      const i = pick()
      if (i < 0) return setSel(null)
      const id = nodes[i].tr.id
      // палец: первое касание — карточка, второе — сделка; мышь — сразу сделка
      if (d.type === 'mouse' || live.current.sel === id) live.current.onOpenTrade(id)
      else setSel(id)
    }
    const onLeave = () => {
      armed = false
      delete host.dataset.brainWheel
      inside = false
      drag = null
      ndc.set(9, 9)
      moved = true
    }
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointerleave', onLeave)
    // колесо: вверх — ближе / внутрь, вниз — наружу — только после клика по сцене (увёл мышь — снова прокрутка страницы);
    // до клика колесо крутит страницу, а над сценой на миг появляется подсказка «нажми, чтобы приближать колесом»
    let armed = false
    let hintTimer = 0
    const wheelHint = mk('pointer-events-none absolute left-1/2 top-1/2 z-[4] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold opacity-0 shadow-lg transition-opacity duration-200')
    wheelHint.dataset.brainWheelHint = ''
    wheelHint.textContent = wheelLabel
    const onWheel = (e: WheelEvent) => {
      if (!armed) {
        wheelHint.style.opacity = '1'
        window.clearTimeout(hintTimer)
        hintTimer = window.setTimeout(() => (wheelHint.style.opacity = '0'), 1400)
        return
      }
      const next = Math.max(0, Math.min(1, zoomT - e.deltaY / 700))
      if (next === zoomT) return
      e.preventDefault()
      zoomT = next
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    const toggle = () => (zoomT = zoomT > 0.5 ? 0 : 1)
    host.addEventListener('brain-toggle', toggle)
    /** нейрон под мышью: точки маленькие — ловим по экранному расстоянию до ближайшего (в пределах 14px) */
    const pv = new THREE.Vector3()
    const pick = (): number => {
      if (!nodes.length) return -1
      const mx = ((ndc.x + 1) / 2) * W
      const my = ((1 - ndc.y) / 2) * size
      let best = -1
      let bestD = 14 * 14
      let bestZ = Infinity
      const lim = Math.min(nodes.length, Math.floor(grown))
      for (let i = 0; i < lim; i++) {
        pv.copy(nodes[i].p).applyMatrix4(brain.matrixWorld)
        const z = pv.clone().applyMatrix4(camera.matrixWorldInverse).z
        if (z > -0.05) continue // за камерой
        pv.project(camera)
        const dx = ((pv.x + 1) / 2) * W - mx
        const dy = ((1 - pv.y) / 2) * size - my
        const d = dx * dx + dy * dy
        // ближе к камере — главнее, если почти рядом на экране
        if (d < bestD || (d < bestD * 1.4 && -z < bestZ)) {
          best = i
          bestD = Math.min(bestD, d)
          bestZ = -z
        }
      }
      void ray
      return best
    }

    let visible = true
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting))
    io.observe(host)

    const v3 = new THREE.Vector3()
    const toScreen = (p: THREE.Vector3) => {
      v3.copy(p).applyMatrix4(brain.matrixWorld).project(camera)
      return { x: ((v3.x + 1) / 2) * W, y: ((1 - v3.y) / 2) * size }
    }
    const inFront = (p: THREE.Vector3) => {
      v3.copy(p).applyMatrix4(brain.matrixWorld).applyMatrix4(camera.matrixWorldInverse)
      return v3.z < -0.6 && v3.z > -camera.position.length() - 0.3
    }
    let tiltX = 0
    let tiltY = 0
    let raf = 0
    let frame = 0
    let lastNow = -1
    let lastTipId = ''
    let calm = false
    let wasBusy = false
    let nextAmbient = 0
    let dimKey = ''
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (!visible || document.hidden) return
      frame++
      // спокойная сцена — 30 кадров/с (без видеокарты — 20), пока что-то происходит — сколько может (без видеокарты — 30)
      if (frame % (calm ? (soft ? 3 : 2) : soft ? 2 : 1)) return
      sync(now)
      const dt = lastNow < 0 ? 0 : Math.max(0, Math.min(0.05, (now - lastNow) / 1000))
      lastNow = now

      // ---------- рост сети ----------
      if (grown < growTo) {
        const before = Math.floor(grown)
        grown = Math.min(growTo, grown + speed * dt)
        const after = Math.floor(grown)
        // каждому новому нейрону — искра по его свежей связи (при быстром росте — не каждому)
        for (let i = before; i < after; i++) {
          const n = nodes[i]
          if (speed < 30 || i % Math.ceil(speed / 30) === 0) {
            const color = n.tr.pnl >= 0 ? C.up : C.down
            // первая сделка монеты — искра от её ядра; дальше — от соседей, к которым тянется новая связь
            if (!n.nb.length) addSpark(cls[n.c].p, n.p, now, color)
            for (const j of n.nb) spark(j, i, now, color)
          }
        }
      }
      // обновляем матрицы только у тех, что ещё «дышат» после появления (и у бывшего / нового под мышью)
      if (inst) {
        const g = Math.floor(grown)
        const from = Math.max(0, g - 8)
        for (let i = from; i < Math.min(nodes.length, g + 1); i++) writeNode(i)
        if (shownCount !== g || from < g) inst.instanceMatrix.needsUpdate = true
        shownCount = g
        links.geometry.setDrawRange(0, (edgeAt[Math.min(g, edgeAt.length - 1)] ?? 0) * 2)
        glow.geometry.setDrawRange(0, g)
        somas.geometry.setDrawRange(0, cls.filter((c) => c.first < g).length)
        showAxons(g, now)
      }

      // «Обновить» — волна искр от первых сделок к последним
      const b = live.current.busy
      // «Обновить» — искры по всем аксонам от ядра к ядру, волной
      if (b && !wasBusy && !still) axonList.forEach((_, k) => axonSpark(k, now + k * 90, k % 2 === 1))
      wasBusy = b
      // редкие импульсы всё время — сеть «живая»
      if (!still && grown >= growTo && now >= nextAmbient && edgeList.length) {
        const [a, c] = edgeList[Math.floor(Math.random() * edgeList.length)]
        if (Math.random() < 0.5) spark(a, c, now)
        else spark(c, a, now)
        nextAmbient = now + (soft ? 800 : 300) + Math.random() * 400
      }

      if (!drag) {
        yawV *= 0.94
        yaw += yawV
        pitchV *= 0.9
        if (!still && hit < 0 && !live.current.sel && !live.current.focus) yaw += AUTO_SPIN * dt * (1 - zoom * 0.6)
      }
      zoom += (zoomT - zoom) * (still ? 1 : 0.07)
      if (zoom < 0.3) pitch *= 0.92
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
      // во время первого роста камера чуть подлетает
      const approach = growTo > 0 && !still ? 1.6 * (1 - easeInOut(Math.min(1, grown / Math.max(1, growTo)))) : 0
      const dist = CAM_D + approach + (CAM_IN - CAM_D) * easeOut(zoom)
      const zk = easeOut(zoom)
      const fov = 30 + 42 * zk
      if (Math.abs(camera.fov - fov) > 0.01) {
        camera.fov = fov
        camera.updateProjectionMatrix()
      }
      const el = 0.22 * (1 - zoom) + tiltX
      camera.position.set(Math.sin(tiltY) * dist * Math.cos(el), Math.sin(el) * dist, Math.cos(tiltY) * dist * Math.cos(el))
      camera.lookAt(0, 0, 0)
      fog.near = dist - 2.6 + (1.5 - (dist - 2.6)) * zk
      fog.far = dist + 4.2 + (9.5 - (dist + 4.2)) * zk
      scene.updateMatrixWorld()
      // внутри: ближние к камере нейроны тают (не закрывают обзор), свечение мельче
      glowMat.size = 0.22 * (1 - 0.45 * zk)
      somaMat.size = 0.9 * (1 - 0.5 * zk)
      const nf = zk > 0.02 ? zk : 0
      if (nf || nearFade) {
        nearFade = nf
        camLocal.copy(camera.position)
        brain.worldToLocal(camLocal)
        if (inst) {
          const lim = Math.min(nodes.length, Math.ceil(grown))
          for (let i = 0; i < lim; i++) writeNode(i)
          inst.instanceMatrix.needsUpdate = true
        }
      }

      // наведение
      if (drag && drag.moved > 6) hit = -1
      else if (moved || frame % 3 === 0) {
        hit = inside ? pick() : -1
        moved = false
      }
      const selId = live.current.sel
      const selI = selId ? nodes.findIndex((n) => n.tr.id === selId) : -1
      const target = hit >= 0 ? hit : selI
      const focusEx = target >= 0 ? null : live.current.focus
      canvas.style.cursor = hit >= 0 ? 'pointer' : drag ? 'grabbing' : 'grab'
      setHighlight(target)
      if (target !== hoverI) {
        const was = hoverI
        hoverI = target
        if (was >= 0 && was < nodes.length) writeNode(was)
        if (target >= 0) writeNode(target)
        if (inst) inst.instanceMatrix.needsUpdate = true
      }
      // фокус (нейрон под мышью и его соседи / биржа из списка) — перекрашиваем, только когда он сменился
      const key = `${target}|${focusEx ?? ''}`
      if (key !== dimKey) {
        dimKey = key
        if (target >= 0) {
          const n = nodes[target]
          const near = new Set([target, ...n.nb, ...n.next])
          dimFor = (i) => (near.has(i) ? 1 : 0.35)
        } else if (focusEx) dimFor = (i) => (nodes[i].tr.exchange === focusEx ? 1 : 0.15)
        else dimFor = () => 1
        recolorAll()
      }
      linkMat.opacity += ((target >= 0 || focusEx ? 0.12 : C.light ? 0.55 : 0.5) - linkMat.opacity) * 0.15

      // искры
      for (let k = sparks.length - 1; k >= 0; k--) {
        const s = sparks[k]
        const kk = (now - s.t0) / s.dur
        if (kk < 0) continue
        if (kk >= 1) {
          brain.remove(s.m)
          s.m.material.dispose()
          sparks.splice(k, 1)
          continue
        }
        const e = easeInOut(kk)
        if (s.path) {
          const f = e * (s.path.length - 1)
          const i0 = Math.min(s.path.length - 2, Math.floor(f))
          s.m.position.lerpVectors(s.path[i0], s.path[i0 + 1], f - i0)
        } else s.m.position.lerpVectors(s.from, s.to, e)
        s.m.material.opacity = Math.sin(Math.PI * kk)
      }

      renderer.render(scene, camera)
      calm = grown >= growTo && !sparks.length && !drag && !inside && target < 0 && !focusEx && Math.abs(yawV) < 0.0005 && Math.abs(zoomT - zoom) < 0.01

      // подписи монет у самых больших «полушарий»
      clusterEls.forEach((el, k) => {
        const c = clusters[k]
        if (!c || target >= 0 || focusEx || c.first >= grown || zoom > 0.3 || !inFront(c.c)) {
          el.style.opacity = '0'
          return
        }
        const p = toScreen(c.c)
        el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`
        el.style.opacity = '1'
      })
      // карточка сделки — целиком в сцене: сверху от нейрона, если помещается, иначе снизу; по бокам не вылезает
      if (target >= 0) {
        const tr = nodes[target].tr
        if (lastTipId !== tr.id) {
          lastTipId = tr.id
          const logo = exchangeLogoUrl(tr.exchange)
          tip.innerHTML =
            `<div class="flex items-center gap-2 font-semibold">${tr.icon ? `<img src="${esc(tr.icon)}" alt="" class="size-[18px] rounded-full bg-surface-2">` : ''}${esc(tr.symbol)} · ${esc(tr.side)}</div>` +
            `<div class="num mt-0.5 font-bold ${tr.pnl >= 0 ? 'text-up' : 'text-down'}">${formatPnl(tr.pnl)}</div>` +
            `<div class="mt-0.5 flex items-center gap-1.5 text-muted">${logo ? `<img src="${logo}" alt="" class="size-4 rounded">` : ''}${esc(tr.exName)} · ${esc(tr.when)}</div>`
        }
        const p = toScreen(nodes[target].p)
        const tw = tip.offsetWidth
        const th = tip.offsetHeight
        const gap = 16
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
      host.dataset.brainGrown = grown >= growTo ? 'done' : 'growing'
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
      window.clearTimeout(hintTimer)
      ;[...clusterEls, tip, wheelHint].forEach((el) => el.remove())
      for (const s of sparks) s.m.material.dispose()
      inst?.dispose()
      glow.geometry.dispose()
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
