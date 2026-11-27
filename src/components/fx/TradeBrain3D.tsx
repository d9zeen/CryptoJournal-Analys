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
 * Третья версия (27.11.2026): нейрон по сумме сделки, изогнутые дендриты с отростками, сигналы цепочкой со вспышками, плавная смена периода
 * (доли на местах за всё время, лишние тают, новые вырастают), клик по подписи монеты — поворот к её доле.
 * Тысячи сделок: нейроны — один InstancedMesh, свечение — Points, связи — одни LineSegments; матрицы и цвета обновляются только когда что-то меняется.
 * Палец: касание — карточка, второе — сделка. Клавиатура и дикторы — скрытые кнопки последних сделок (data-brain-trade): фокус = наведение, Enter — сделка.
 * «Уменьшить движение» — сеть сразу целиком, без вращения и импульсов. Вне экрана и в фоновой вкладке не рисуем; пиксели ≤ 1,5×;
 * сцена строится, когда страница свободна; без видеокарты (SwiftShader / llvmpipe) — пиксели 1×, реже кадры, меньше импульсов. Цвета — токены theme.css.
 */
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { exchangeLogoUrl } from '@/components/ExchangeLogo'
import { BrainPlaceholder } from '@/components/fx/BrainPlaceholder'
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
  /** порядок монет за всё время: место «доли» монеты не зависит от выбранного диапазона (смена периода — без перестройки) */
  coins?: string[]
  /** монета, к которой повернулся мозг (клик по подписи); null — весь мозг */
  coin?: string | null
  onCoin?: (label: string | null) => void
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
/**
 * центр «доли» монеты: 30 мест по сфере (точки Фибоначчи); монеты по порядку появления за всё время берут места через 11
 * (соседние монеты — в разных концах мозга), больше 30 — вторым, внутренним слоем. Место не зависит от числа монет и диапазона:
 * при смене периода и новых монетах доли не прыгают.
 */
const SLOTS = 30
function lobeCenter(c: number, out: THREE.Vector3): THREE.Vector3 {
  const k = (c * 11) % SLOTS
  const y = 1 - (2 * (k + 0.5)) / SLOTS
  const r = Math.sqrt(1 - y * y)
  const phi = k * 2.399963 // золотой угол
  return out.set(r * Math.cos(phi), y, r * Math.sin(phi)).multiplyScalar(R * (c < SLOTS ? 0.72 : 0.42)).multiply(SHAPE)
}
/** ближайший к a угол, равный b по модулю 2π */
const nearAngle = (a: number, b: number) => a + ((((b - a) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI
/** место нейрона: центр доли своей монеты + разброс по id сделки (плотнее к центру доли) */
function placeOf(tr: BrainTrade, center: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const off = dirOf(tr.id, 1, 2, new THREE.Vector3()).multiplyScalar(R * 0.3 * Math.pow(hash(tr.id, 3), 0.6))
  return out.copy(center).add(off.multiply(SHAPE))
}

export function TradeBrain3D({ trades, size, focus, busy, onOpenTrade, onRefresh, labels, onFail, scheme: schemeProp, coins, coin = null, onCoin }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const live = useRef({ trades, focus, busy, onOpenTrade, sel: null as string | null, coins, coin, onCoin })
  live.current.trades = trades
  live.current.focus = focus
  live.current.busy = busy
  live.current.onOpenTrade = onOpenTrade
  live.current.coins = coins
  live.current.coin = coin
  live.current.onCoin = onCoin
  const [sel, setSel] = useState<string | null>(null)
  live.current.sel = sel
  const [inner, setInner] = useState(false)
  // пока сцена не построена — заготовка; готова — сцена проявляется, заготовка тает (без резкой смены)
  const [ready, setReady] = useState(false)
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
    canvas.className = 'transition-opacity duration-500 motion-reduce:transition-none'
    canvas.style.opacity = '0'
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
    // pivot вращается, brain внутри сдвинут так, что центр сделок — в центре сцены (диапазон поменялся — центр переезжает плавно)
    const pivot = new THREE.Group()
    scene.add(pivot)
    const brain = new THREE.Group()
    pivot.add(brain)
    const center = new THREE.Vector3()

    // HTML поверх сцены: подписи «полушарий» и карточка сделки
    const mk = (cls: string) => {
      const el = document.createElement('div')
      el.className = cls
      el.setAttribute('aria-hidden', 'true')
      host.appendChild(el)
      return el
    }
    // подписи монет — кнопки: нажал — мозг поворачивается к этой доле (владелец 27.11.2026)
    const clusterEls = Array.from({ length: small ? 3 : 6 }, () => {
      const el = document.createElement('button')
      el.type = 'button'
      el.tabIndex = -1
      el.className =
        'absolute left-0 top-0 z-[2] cursor-pointer whitespace-nowrap rounded-md border border-transparent bg-surface/70 px-1.5 py-0.5 text-xs font-semibold text-muted opacity-0 transition-[opacity,color,border-color] duration-300 hover:border-primary/60 hover:text-text'
      el.style.pointerEvents = 'none'
      el.addEventListener('click', () => {
        const label = el.dataset.brainCoin
        if (!label) return
        live.current.onCoin?.(live.current.coin === label ? null : label)
      })
      host.appendChild(el)
      return el
    })
    const tip = mk('pointer-events-none absolute left-0 top-0 z-[5] whitespace-nowrap rounded-xl border border-border bg-surface px-3 py-2.5 text-sm opacity-0 shadow-lg transition-opacity duration-150')
    tip.dataset.brainTip = ''

    // ---------- нейроны: ядро — InstancedMesh, свечение — Points; дендриты внутри доли и «аксоны» между ними ----------
    const nodeGeo = track(new THREE.IcosahedronGeometry(1, 2))
    const nodeMat = track(new THREE.MeshBasicMaterial())
    let cap = 0
    let inst: THREE.InstancedMesh | null = null
    // нейроны, которые тают при смене периода (их сделок в новом диапазоне нет)
    let ghostInst: THREE.InstancedMesh | null = null
    let ghosts: { p: THREE.Vector3; r: number; c: THREE.Color }[] = []
    let ghostT0 = 0
    const GHOST_MS = 520
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
    // свечение: на тёмной — сложением света (светится), на светлой — обычной прозрачностью (иначе не видно);
    // размер у каждого нейрона свой (aSize — по сумме сделки, вспышка — когда до него добежал сигнал)
    const glowMat = track(new THREE.PointsMaterial({ size: 0.22, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true }))
    glowMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('uniform float size;', 'uniform float size;\nattribute float aSize;').replace('gl_PointSize = size;', 'gl_PointSize = size * aSize;')
    }
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
    /** сделки в плюс — с них чаще начинаются сигналы */
    let wins: number[] = []
    let maxAbs = 1
    /** порядок показа: сначала то, что уже было на экране, потом новое (по времени) — сколько отрезков дендритов у первых i нейронов */
    let segAt: number[] = [0]
    let edgeList: [number, number][] = []
    /** точки изогнутого дендрита (от меньшего номера нейрона к большему) — по ним бегут сигналы и подсветка */
    const edgePts = new Map<string, THREE.Vector3[]>()
    const ekey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`)
    /** у каждой вершины отрезка: нейроны концов, доля пути между ними и насколько кончик веточки растворяется в фоне */
    let vA = new Int32Array(0)
    let vB = new Int32Array(0)
    let vT = new Float32Array(0)
    let vF = new Float32Array(0)
    /** «аксоны» между ядрами: появляются, когда появились оба «полушария» */
    let axonList: { a: number; b: number; at: number; pts: THREE.Vector3[] }[] = []
    let axonShown = -1
    /** размер нейрона по сумме сделки (владелец 27.11.2026: крупная сделка — крупный яркий нейрон, мелкая — маленький); шкала — по 95-му перцентилю, чтобы одна огромная сделка не сделала остальные точками */
    const radiusOf = (pnl: number) => 0.011 + 0.042 * Math.pow(Math.min(1, Math.abs(pnl) / maxAbs), 0.55)

    // рост сети: grown — сколько нейронов уже «выросло» (дробное), growTo — до скольких растём, speed — нейронов в секунду
    let grown = 0
    let growTo = 0
    let speed = 1
    let shownCount = -1
    /** первое появление — камера подлетает; при смене периода и новых сделках — нет */
    let intro = true
    type Spark = { from: THREE.Vector3; to: THREE.Vector3; t0: number; dur: number; m: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>; path?: THREE.Vector3[]; hit?: number }
    const sparks: Spark[] = []
    const sparkGeo = track(new THREE.SphereGeometry(0.026, 10, 8))
    const MAX_SPARKS = soft ? 24 : 90
    /** искра от from к to (по точкам path, если есть); hit — нейрон, который вспыхнет, когда она добежит. Возвращает длительность */
    const addSpark = (from: THREE.Vector3, to: THREE.Vector3, at: number, color: THREE.Color, path?: THREE.Vector3[], slow = false, hitI?: number) => {
      if (still || sparks.length >= MAX_SPARKS) return 0
      const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: blendFor() }))
      brain.add(m)
      const dur = (slow ? 900 : 380) + from.distanceTo(to) * (slow ? 220 : 160)
      sparks.push({ from, to, t0: at, dur, m, path, hit: hitI })
      return dur
    }
    /** искра по дендриту между нейронами a → b */
    const spark = (a: number, b: number, at: number, color?: THREE.Color, hitI?: number) => {
      if (!nodes[a] || !nodes[b]) return 0
      const pts = edgePts.get(ekey(a, b))
      const path = pts && a > b ? [...pts].reverse() : pts
      return addSpark(nodes[a].p, nodes[b].p, at, color ?? C.primary, path, false, hitI)
    }
    const axonSpark = (k: number, at: number, rev = false) => {
      const ax = axonList[k]
      if (!ax) return
      const path = rev ? [...ax.pts].reverse() : ax.pts
      addSpark(path[0], path[path.length - 1], at, C.primary, path, true)
    }
    /** вспышки нейронов, до которых добежал сигнал: номер → время */
    const flashes = new Map<number, number>()
    const FLASH_MS = 520
    let nowT = 0

    const mtx = new THREE.Matrix4()
    const qI = new THREE.Quaternion()
    const sv = new THREE.Vector3()
    const col = new THREE.Color()
    let dimFor: (i: number) => number = () => 1
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
    /** ядро нейрона: цвет схемы, смягчённый к цвету текста; крупная сделка — ярче, мелкая — тише; не в фокусе — к фону */
    const colorOf = (i: number, out: THREE.Color) =>
      baseOf(i, out)
        .lerp(C.text, C.light ? 0.18 : 0.28)
        .lerp(C.surface, (1 - dimFor(i)) * 0.85 + (1 - weightOf(i)) * 0.18)
    /** свечение — чистый цвет, тише */
    const glowOf = (i: number, out: THREE.Color) => baseOf(i, out).lerp(C.surface, (1 - dimFor(i)) * 0.92)
    /** 0…1: насколько крупная сделка */
    const weightOf = (i: number) => Math.min(1, (nodes[i].r - 0.011) / 0.042)
    let hoverI = -1
    let nearFade = 0
    const camLocal = new THREE.Vector3()
    const flashK = (i: number) => {
      const t = flashes.get(i)
      if (t === undefined) return 0
      const k = 1 - (nowT - t) / FLASH_MS
      return k > 0 ? k * k : 0
    }
    /** размер нейрона: по сумме, пока растёт — с «вдохом», под мышью — крупнее, сигнал добежал — вспыхнул; внутри мозга ближние к камере тают */
    const scaleAt = (i: number) => {
      if (i >= grown) return 0
      const k = Math.min(1, (grown - i) / 6)
      const pop = k < 1 ? easeOut(k) * (1 + Math.sin(k * Math.PI) * 0.8) : 1
      let s = nodes[i].r * pop * (i === hoverI ? 2.2 : 1) * (1 + 0.9 * flashK(i))
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
    /** размер свечения: по сумме сделки, вспышка — вдвое */
    const writeGlowSize = (i: number) => {
      const a = glow.geometry.getAttribute('aSize') as THREE.BufferAttribute | undefined
      if (!a) return
      a.setX(i, (0.55 + 1.5 * weightOf(i)) * (1 + 1.2 * flashK(i)))
      a.needsUpdate = true
    }
    let gcache = new Float32Array(0)
    const recolorAll = () => {
      if (!inst) return
      const gc = glow.geometry.getAttribute('color') as THREE.BufferAttribute | undefined
      if (gcache.length !== nodes.length * 3) gcache = new Float32Array(nodes.length * 3)
      const h = hub()
      for (let i = 0; i < nodes.length; i++) {
        inst.setColorAt(i, colorOf(i, col))
        glowOf(i, col)
        if (gc) gc.setXYZ(i, col.r, col.g, col.b)
        // для дендритов — цвет свечения, сильно приглушённый к цвету кнопок
        col.lerp(h, 0.55)
        gcache[i * 3] = col.r
        gcache[i * 3 + 1] = col.g
        gcache[i * 3 + 2] = col.b
      }
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true
      if (gc) gc.needsUpdate = true
      // дендриты: цвет плавно переходит от одного нейрона к другому, кончики веточек растворяются в фоне
      const lc = links.geometry.getAttribute('color') as THREE.BufferAttribute | undefined
      if (lc) {
        const arr = lc.array as Float32Array
        const sr = C.surface.r
        const sg = C.surface.g
        const sb = C.surface.b
        for (let v = 0; v < vA.length; v++) {
          const a = vA[v] * 3
          const b = vB[v] * 3
          const t = vT[v]
          const f = vF[v]
          const r = gcache[a] + (gcache[b] - gcache[a]) * t
          const g = gcache[a + 1] + (gcache[b + 1] - gcache[a + 1]) * t
          const bl = gcache[a + 2] + (gcache[b + 2] - gcache[a + 2]) * t
          arr[v * 3] = r + (sr - r) * f
          arr[v * 3 + 1] = g + (sg - g) * f
          arr[v * 3 + 2] = bl + (sb - bl) * f
        }
        lc.needsUpdate = true
      }
    }

    /** изогнутый дендрит a → b: дуга в сторону (из номеров сделок — всегда одна и та же) */
    const SEG = soft ? 4 : 6
    const curveOf = (a: N, b: N): THREE.Vector3[] => {
      const d = b.p.clone().sub(a.p)
      const len = d.length()
      const side = dirOf(a.tr.id + b.tr.id, 7, 8, new THREE.Vector3())
      side.addScaledVector(d, -side.dot(d) / Math.max(1e-6, len * len)).normalize()
      const ctrl = a.p.clone().add(b.p).multiplyScalar(0.5).addScaledVector(side, len * (0.12 + 0.22 * hash(a.tr.id + b.tr.id, 9)))
      return new THREE.QuadraticBezierCurve3(a.p, ctrl, b.p).getPoints(SEG)
    }

    /**
     * собрать сеть заново (сделки поменялись). keep — сделки, которые уже на экране: они идут первыми и не появляются заново
     * (смена периода: лишние тают, новые вырастают; пришли с биржи — достраиваются).
     */
    const build = (list: BrainTrade[], keep: Set<string>) => {
      const abs = list.map((x) => Math.abs(x.pnl)).sort((a, b) => a - b)
      maxAbs = Math.max(1, abs[Math.floor((abs.length - 1) * 0.95)] ?? 1)
      // доли — по порядку монет за всё время (не прыгают при смене периода); монеты, которых там ещё нет, — в конец
      const order = new Map<string, number>()
      for (const c of live.current.coins ?? []) if (!order.has(c)) order.set(c, order.size)
      for (const x of list) if (!order.has(x.label)) order.set(x.label, order.size)
      const byLabel = new Map<string, number>()
      const clsT: Cl[] = []
      // 1) по времени: место, размер и два ближайших более ранних соседа той же монеты
      type T = { tr: BrainTrade; p: THREE.Vector3; r: number; c: number; nb: number[] }
      const tn: T[] = []
      const membersT: number[][] = []
      list.forEach((tr, i) => {
        let c = byLabel.get(tr.label)
        if (c === undefined) {
          c = clsT.length
          byLabel.set(tr.label, c)
          clsT.push({ label: tr.label, first: 0, n: 0, p: lobeCenter(order.get(tr.label)!, new THREE.Vector3()), members: [] })
          membersT.push([])
        }
        const p = placeOf(tr, clsT[c].p, new THREE.Vector3())
        const nb = membersT[c]
          .slice(-160)
          .map((j) => ({ j, d: tn[j].p.distanceToSquared(p) }))
          .sort((x, y) => x.d - y.d)
          .slice(0, 2)
          .map((x) => x.j)
        tn.push({ tr, p, r: radiusOf(tr.pnl), c, nb })
        membersT[c].push(i)
      })
      // 2) порядок показа: что уже на экране — первым, потом новое; оба — по времени
      const perm = [...tn.keys()].sort((a, b) => Number(!keep.has(tn[a].tr.id)) - Number(!keep.has(tn[b].tr.id)) || a - b)
      const inv = new Int32Array(tn.length)
      perm.forEach((t, i) => (inv[t] = i))
      nodes = perm.map((t) => ({ tr: tn[t].tr, p: tn[t].p, r: tn[t].r, c: tn[t].c, nb: tn[t].nb.map((j) => inv[j]), next: [] }))
      cls = clsT
      cls.forEach((c) => {
        c.first = Infinity
        c.n = 0
        c.members = []
      })
      nodes.forEach((n, i) => {
        const c = cls[n.c]
        c.first = Math.min(c.first, i)
        c.n++
        c.members.push(i)
      })
      wins = nodes.flatMap((n, i) => (n.tr.pnl > 0 ? [i] : []))
      center.set(0, 0, 0)
      for (const n of nodes) center.add(n.p)
      if (nodes.length) center.divideScalar(nodes.length)
      // 3) дендриты (появляются вместе с более поздним по показу концом) и веточки-отростки у части нейронов
      edgeList = []
      nodes.forEach((n, i) => {
        for (const j of n.nb) {
          edgeList.push([j, i])
          nodes[j].next.push(i)
        }
      })
      const byShow: [number, number][][] = nodes.map(() => [])
      for (const e of edgeList) byShow[Math.max(e[0], e[1])].push(e)
      const twigs = nodes.length <= (soft ? 600 : 2500)
      const pos: number[] = []
      const la: number[] = []
      const lb: number[] = []
      const lt: number[] = []
      const lf: number[] = []
      const push = (p: THREE.Vector3, a: number, b: number, t: number, f: number) => {
        pos.push(p.x, p.y, p.z)
        la.push(a)
        lb.push(b)
        lt.push(t)
        lf.push(f)
      }
      edgePts.clear()
      segAt = [0]
      const tw = new THREE.Vector3()
      const bend = new THREE.Vector3()
      nodes.forEach((n, i) => {
        for (const [a, b] of byShow[i]) {
          const lo = Math.min(a, b)
          const hi = Math.max(a, b)
          const pts = curveOf(nodes[lo], nodes[hi])
          edgePts.set(ekey(lo, hi), pts)
          for (let s = 0; s < pts.length - 1; s++) {
            push(pts[s], lo, hi, s / SEG, 0)
            push(pts[s + 1], lo, hi, (s + 1) / SEG, 0)
          }
        }
        // 0–2 тонких отростка: короткая изогнутая веточка наружу, кончик тает
        const cnt = twigs ? Math.floor(hash(n.tr.id, 11) * 2.6) : 0
        for (let k = 0; k < cnt; k++) {
          const dir = dirOf(n.tr.id, 12 + k * 2, 13 + k * 2, tw)
          const L = 0.07 + 0.13 * hash(n.tr.id, 20 + k) + n.r * 1.5
          dirOf(n.tr.id, 30 + k, 31 + k, bend).multiplyScalar(L * 0.35)
          const mid = n.p.clone().addScaledVector(dir, L * 0.5).add(bend)
          const end = n.p.clone().addScaledVector(dir, L).addScaledVector(bend, 1.6)
          push(n.p, i, i, 0, 0.25)
          push(mid, i, i, 0, 0.6)
          push(mid, i, i, 0, 0.6)
          push(end, i, i, 0, 1)
        }
        segAt.push(pos.length / 6)
      })
      vA = Int32Array.from(la)
      vB = Int32Array.from(lb)
      vT = Float32Array.from(lt)
      vF = Float32Array.from(lf)
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
      gg.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(nodes.length), 1))
      glow.geometry = gg
      links.geometry.dispose()
      const lg = new THREE.BufferGeometry()
      lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      lg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.length), 3))
      links.geometry = lg
      // ядра — в порядке появления долей: drawRange по числу появившихся
      const somaOrder = [...cls].sort((a, b) => a.first - b.first)
      const sp = new Float32Array(cls.length * 3)
      somaOrder.forEach((c, k) => c.p.toArray(sp, k * 3))
      somas.geometry.dispose()
      const sg = new THREE.BufferGeometry()
      sg.setAttribute('position', new THREE.BufferAttribute(sp, 3))
      somas.geometry = sg
      somaFirsts = somaOrder.map((c) => c.first)
      hlFor = -2
      flashes.clear()
      recolorAll()
      for (let i = 0; i < nodes.length; i++) {
        writeNode(i)
        writeGlowSize(i)
      }
      inst.instanceMatrix.needsUpdate = true
      buildClusters()
      host.dataset.brainCount = String(nodes.length)
    }
    let somaFirsts: number[] = []
    /** аксоны, у которых уже появились оба «полушария» */
    const showAxons = (g: number, now: number) => {
      const n = axonList.filter((x) => x.at < g).length
      if (n === axonShown) return
      const was = axonShown
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
      if (n > 0 && was >= 0 && n > was && grown < growTo) axonSpark(n - 1, now)
    }

    // подписи у самых больших «полушарий»
    let clusters: { label: string; n: number; c: THREE.Vector3; first: number }[] = []
    const buildClusters = () => {
      clusters = [...cls]
        .sort((a, b) => b.n - a.n)
        .map((c) => ({ label: c.label, n: c.n, c: c.p, first: c.first }))
    }

    // подсветка связей нейрона под мышью — по изгибам дендритов
    let hlFor = -2
    const setHighlight = (i: number) => {
      if (i === hlFor) return
      hlFor = i
      const pts: number[] = []
      if (i >= 0) {
        const n = nodes[i]
        for (const j of [...n.nb, ...n.next]) {
          if (j < 0 || j >= grown) continue
          const e = edgePts.get(ekey(i, j))
          if (!e) continue
          for (let s = 0; s < e.length - 1; s++) pts.push(e[s].x, e[s].y, e[s].z, e[s + 1].x, e[s + 1].y, e[s + 1].z)
        }
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
      // на экране уже было: те, что успели вырасти (их номер показа < grown)
      const visibleIds = new Set(nodes.slice(0, Math.floor(grown)).map((n) => n.tr.id))
      const next = new Set(seen)
      const keep = new Set(first || still ? [] : [...visibleIds].filter((id) => next.has(id)))
      // тают: были на экране, а в новом списке их нет (сменили период)
      if (!still && !first) {
        ghosts = nodes
          .slice(0, Math.floor(grown))
          .flatMap((n, i) => (next.has(n.tr.id) ? [] : [{ p: n.p, r: n.r, c: colorOf(i, new THREE.Color()) }]))
          .slice(-1500)
        ghostT0 = now
        makeGhosts()
      }
      const appended = !first && old.length > 0 && old.length < list.length && old.every((id, i) => id === seen[i])
      build(list, keep)
      if (still) {
        grown = growTo = nodes.length
      } else if (first) {
        grown = 0
        growTo = nodes.length
        // вся сеть вырастает за 2,5–6 с, сколько бы ни было сделок
        speed = Math.max(nodes.length / 6, Math.min(nodes.length / 2.5, 40)) || 1
      } else {
        grown = keep.size
        growTo = nodes.length
        // пришедшие с биржи — по одной (видно, как каждая встаёт на место); другой период — новые вырастают за ~1,4 с
        speed = appended ? Math.max(2.5, (growTo - grown) / 4) : Math.max(8, (growTo - grown) / 1.4)
        intro = false
      }
      first = false
    }
    /** нейроны, которые тают: свой InstancedMesh, цвета — какими были */
    const makeGhosts = () => {
      if (ghostInst) {
        brain.remove(ghostInst)
        ghostInst.dispose()
        ghostInst = null
      }
      if (!ghosts.length) return
      ghostInst = new THREE.InstancedMesh(nodeGeo, nodeMat, ghosts.length)
      ghostInst.frustumCulled = false
      ghosts.forEach((g, i) => {
        mtx.compose(g.p, qI, sv.setScalar(g.r))
        ghostInst!.setMatrixAt(i, mtx)
        ghostInst!.setColorAt(i, g.c)
      })
      brain.add(ghostInst)
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
      if (i < 0) {
        if (live.current.coin) live.current.onCoin?.(null)
        return setSel(null)
      }
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
    // Esc — снова весь мозг
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && live.current.coin) live.current.onCoin?.(null)
    }
    host.addEventListener('keydown', onKey)
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
    let lastCoin: string | null = null
    let steer = false
    let coinK = 0
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (!visible || document.hidden) return
      frame++
      // спокойная сцена — 30 кадров/с (без видеокарты — 20), пока что-то происходит — сколько может (без видеокарты — 30)
      if (frame % (calm ? (soft ? 3 : 2) : soft ? 2 : 1)) return
      nowT = now
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
            for (const j of n.nb) if (j < i) spark(j, i, now, color)
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
        links.geometry.setDrawRange(0, (segAt[Math.min(g, segAt.length - 1)] ?? 0) * 2)
        glow.geometry.setDrawRange(0, g)
        somas.geometry.setDrawRange(0, somaFirsts.filter((f) => f < g).length)
        showAxons(g, now)
        // вспышки нейронов, до которых добежал сигнал
        if (flashes.size) {
          for (const [i, t] of flashes) {
            if (i < nodes.length) {
              writeNode(i)
              writeGlowSize(i)
            }
            if (now - t > FLASH_MS) flashes.delete(i)
          }
          inst.instanceMatrix.needsUpdate = true
        }
      }
      // нейроны прежнего периода тают
      if (ghostInst) {
        const k = (now - ghostT0) / GHOST_MS
        if (k >= 1) {
          brain.remove(ghostInst)
          ghostInst.dispose()
          ghostInst = null
          ghosts = []
        } else {
          const e = 1 - easeOut(Math.max(0, k))
          ghosts.forEach((g, i) => {
            mtx.compose(g.p, qI, sv.setScalar(g.r * e))
            ghostInst!.setMatrixAt(i, mtx)
          })
          ghostInst.instanceMatrix.needsUpdate = true
        }
      }

      // «Обновить» — волна искр от первых сделок к последним
      const b = live.current.busy
      // «Обновить» — искры по всем аксонам от ядра к ядру, волной
      if (b && !wasBusy && !still) axonList.forEach((_, k) => axonSpark(k, now + k * 90, k % 2 === 1))
      wasBusy = b
      // мозг «думает» всё время (владелец 27.11.2026): сигнал бежит по 2–4 дендритам подряд, нейроны на пути вспыхивают;
      // чаще стартует со сделок в плюс, выбрана монета — с её доли; иногда — по аксону между долями
      const coinNow = live.current.coin
      if (!still && grown >= growTo && now >= nextAmbient && nodes.length > 1) {
        const pool = coinNow ? (cls.find((c) => c.label === coinNow)?.members ?? []) : wins.length && Math.random() < 0.7 ? wins : null
        let i = pool && pool.length ? pool[Math.floor(Math.random() * pool.length)] : Math.floor(Math.random() * nodes.length)
        let t = now
        const hops = 2 + Math.floor(Math.random() * 3)
        for (let h = 0; h < hops; h++) {
          const nbs = [...nodes[i].nb, ...nodes[i].next]
          if (!nbs.length) break
          const j = nbs[Math.floor(Math.random() * nbs.length)]
          const d = spark(i, j, t, undefined, j)
          if (!d) break
          t += d * 0.9
          i = j
        }
        if (!coinNow && axonList.length > 0 && axonShown > 0 && Math.random() < 0.3) axonSpark(Math.floor(Math.random() * axonShown), now, Math.random() < 0.5)
        nextAmbient = now + (soft ? 1500 : 650) + Math.random() * 700
      }

      // выбрана монета — мозг поворачивается к её доле и чуть приближается; потянул мышью — дальше крутишь сам
      const ci = coinNow ? cls.findIndex((c) => c.label === coinNow) : -1
      if (coinNow !== lastCoin) {
        lastCoin = coinNow
        steer = ci >= 0
        if (ci >= 0 && zoomT > 0.5) zoomT = 0
      }
      coinK += ((ci >= 0 ? 1 : 0) - coinK) * (still ? 1 : 0.06)
      if (steer && ci >= 0 && !drag) {
        const cp = sv.copy(cls[ci].p).sub(center)
        const ty = Math.atan2(-cp.x, cp.z)
        const tp = Math.max(-1.1, Math.min(1.1, Math.atan2(cp.y, Math.hypot(cp.x, cp.z))))
        const k = still ? 1 : 0.07
        yaw += (nearAngle(yaw, ty) - yaw) * k
        pitch += (tp - pitch) * k
        yawV = pitchV = 0
      }
      if (drag && drag.moved > 6) steer = false
      if (!drag) {
        yawV *= 0.94
        yaw += yawV
        pitchV *= 0.9
        if (!still && hit < 0 && !live.current.sel && !live.current.focus && ci < 0) yaw += AUTO_SPIN * dt * (1 - zoom * 0.6)
      }
      zoom += (zoomT - zoom) * (still ? 1 : 0.07)
      if (zoom < 0.3 && !(steer && ci >= 0)) pitch *= 0.92
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
      pivot.rotation.y = yaw
      pivot.rotation.x = pitch
      brain.position.lerp(sv.copy(center).negate(), still ? 1 : 0.05)
      // во время первого роста камера чуть подлетает
      const approach = intro && growTo > 0 && !still ? 1.6 * (1 - easeInOut(Math.min(1, grown / Math.max(1, growTo)))) : 0
      if (intro && grown >= growTo && growTo > 0) intro = false
      const coinD = ci >= 0 ? sv.copy(cls[ci].p).sub(center).length() + 6.4 : CAM_D
      const dist = CAM_D + approach + (coinD - CAM_D) * easeInOut(coinK) * (1 - zoom) + (CAM_IN - CAM_D) * easeOut(zoom)
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
      const key = `${target}|${focusEx ?? ''}|${ci}|${nodes.length}`
      if (key !== dimKey) {
        dimKey = key
        if (target >= 0) {
          const n = nodes[target]
          const near = new Set([target, ...n.nb, ...n.next])
          dimFor = (i) => (near.has(i) ? 1 : 0.35)
        } else if (focusEx) dimFor = (i) => (nodes[i].tr.exchange === focusEx ? 1 : 0.15)
        else if (ci >= 0) dimFor = (i) => (nodes[i].c === ci ? 1 : 0.1)
        else dimFor = () => 1
        recolorAll()
      }
      linkMat.opacity += ((target >= 0 || focusEx ? 0.12 : C.light ? 0.55 : 0.5) - linkMat.opacity) * 0.15
      axonMat.opacity += ((ci >= 0 ? 0.12 : C.light ? 0.4 : 0.42) - axonMat.opacity) * 0.15

      // искры
      for (let k = sparks.length - 1; k >= 0; k--) {
        const s = sparks[k]
        const kk = (now - s.t0) / s.dur
        if (kk < 0) continue
        if (kk >= 1) {
          brain.remove(s.m)
          s.m.material.dispose()
          sparks.splice(k, 1)
          if (s.hit !== undefined && s.hit < grown) flashes.set(s.hit, now)
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
      calm =
        grown >= growTo && !sparks.length && !flashes.size && !ghostInst && !drag && !inside && target < 0 && !focusEx && Math.abs(yawV) < 0.0005 && Math.abs(zoomT - zoom) < 0.01 && Math.abs(coinK - (ci >= 0 ? 1 : 0)) < 0.01

      // подписи монет у самых больших долей; выбрана монета — только её подпись (рамкой цвета кнопок)
      const shown = ci >= 0 ? clusters.filter((c) => c.label === coinNow) : clusters
      clusterEls.forEach((el, k) => {
        const c = shown[k]
        if (!c || target >= 0 || focusEx || c.first >= grown || zoom > 0.3 || !inFront(c.c)) {
          el.style.opacity = '0'
          el.style.pointerEvents = 'none'
          el.tabIndex = -1
          return
        }
        if (el.dataset.brainCoin !== c.label || el.dataset.n !== String(c.n)) {
          el.dataset.brainCoin = c.label
          el.dataset.n = String(c.n)
          el.textContent = `${c.label} · ${c.n}`
        }
        el.classList.toggle('border-primary', ci >= 0)
        el.classList.toggle('text-text', ci >= 0)
        el.setAttribute('aria-pressed', String(ci >= 0))
        const p = toScreen(c.c)
        el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`
        el.style.opacity = '1'
        el.style.pointerEvents = 'auto'
        el.tabIndex = 0
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
    // проявить после первого кадра
    requestAnimationFrame(() => requestAnimationFrame(() => (canvas.style.opacity = '1')))
    setReady(true)

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
      host.removeEventListener('keydown', onKey)
      window.clearTimeout(hintTimer)
      ;[...clusterEls, tip, wheelHint].forEach((el) => el.remove())
      for (const s of sparks) s.m.material.dispose()
      inst?.dispose()
      ghostInst?.dispose()
      glow.geometry.dispose()
      links.geometry.dispose()
      hl.geometry.dispose()
      disposables.forEach((d) => d.dispose())
      renderer.dispose()
      canvas.remove()
      delete host.dataset.brainReady
      setReady(false)
    }
  }

  // для клавиатуры и дикторов — последние сделки кнопками; фокус = наведение
  const recent = trades.slice(-12).reverse()
  return (
    <div ref={wrap} data-brain role="group" aria-label={labels.scene} className="relative overflow-hidden" style={{ width: W, height: size, maxWidth: '100%' }}>
      <BrainPlaceholder size={size} className={`absolute inset-0 transition-opacity duration-500 motion-reduce:transition-none ${ready ? 'opacity-0' : ''}`} />
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
