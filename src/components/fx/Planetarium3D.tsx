/**
 * «3D-планетарий» на странице «Биржи» (владелец 22.11.2026: «более крутую анимацию… с которой можно контактировать… 3D»;
 * выбор — планетарий на Three.js; образцы 21st.dev: cosmos-3d-orbit-gallery, radial-orbital-timeline, wireframe-dotted-globe).
 *
 * Вторая версия (владелец 22.11.2026: «в центре значок эфира — должен быть наш логотип», «лагает», «почему красный, что подсвечивается синим», «много прибамбасов»):
 *  - в центре — НАШ значок объёмом: четырёхлучевая звезда (LOGO_STAR) в разорванном шестиугольнике (LOGO_HEX), те же контуры, что у LogoMark;
 *  - биржи — объёмные плитки (толщина, скругление, свет), всегда смотрят на зрителя; дальние темнее и меньше — глубина без «свечения»;
 *  - никаких светящихся пятен: подключена — рамка цвета кнопок и зелёная точка в углу, ключ не работает — красная точка (это и есть «красный»), не подключена — плитка бледнее;
 *  - огоньки-сделки — маленькие и редкие.
 * Взаимодействие: мышь — наклон к курсору; зажал и потянул (пальцем — так же) — вращение с инерцией; навёл на биржу — крупнее, вращение замирает,
 * подпись (название, статус); нажал — её панель (onOpen); на значок — «Обновить все» (onCenter): значок делает оборот, по кольцам — волна.
 * Скорость: пиксели не больше 1,5× (на 4K-экране не 4 миллиона точек), луч мыши — только при движении мыши и раз в 3 кадра, вне экрана и в фоне — не рисуем.
 * Клавиатура и экранные дикторы — скрытые кнопки (data-planet-sat / data-planet-core): фокус подсвечивает биржу так же, как наведение.
 * «Уменьшить движение» — без самовращения и огоньков. Цвета — токены theme.css, перекрашивается при смене темы / палитры.
 */
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'
import { exchangeLogoUrl } from '@/components/ExchangeLogo'
import { LOGO_HEX, LOGO_STAR } from '@/components/Logo'

export type PlanetSat = {
  id: string
  name: string
  /** подключена — рамка цвета кнопок, зелёная точка, огоньки-сделки */
  lit: boolean
  /** вторая строка подписи: «Работает · обновлено 12 мин назад», «Не подключена — нажми, чтобы подключить» */
  status: string
  /** ключ не работает — красная точка */
  error?: boolean
  /** внутреннее кольцо (кошельки, Hyperliquid, Polymarket…) */
  inner?: boolean
}

type Props = {
  sats: PlanetSat[]
  /** высота сцены; ширина — в 1,3 раза больше */
  size: number
  onOpen: (id: string) => void
  onCenter: () => void
  /** идёт «Обновить все» — значок крутится */
  busy?: boolean
  labels: { center: string; scene: string }
  /** WebGL недоступен — нарисовать запасной вариант */
  onFail?: () => void
}

/** Цвет токена theme.css → THREE.Color (через пиксель canvas: понимает hex, rgb, oklch, var()) */
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

type Palette = { primary: THREE.Color; logo: THREE.Color; tile: THREE.Color; border: THREE.Color; muted: THREE.Color; up: THREE.Color; down: THREE.Color; dark: boolean }
function readPalette(): Palette {
  return {
    primary: tokenColor('--color-primary'),
    logo: tokenColor('--color-logo'),
    tile: tokenColor('--color-surface-2'),
    border: tokenColor('--color-border'),
    muted: tokenColor('--color-muted'),
    up: tokenColor('--color-up'),
    down: tokenColor('--color-down'),
    dark: document.documentElement.dataset.theme !== 'light',
  }
}

const css = (c: THREE.Color) => `#${c.getHexString(THREE.SRGBColorSpace)}`

/** Лицо плитки: логотип биржи на скруглённом квадрате, рамка (подключена — цвет кнопок), точка статуса в углу (работает — зелёная, ключ не работает — красная) */
function faceTexture(sat: PlanetSat, pal: Palette, logo: HTMLImageElement | null): THREE.CanvasTexture {
  const S = 256
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const ctx = cv.getContext('2d')!
  const inset = 6
  const path = () => {
    ctx.beginPath()
    ctx.roundRect(inset, inset, S - inset * 2, S - inset * 2, 50)
  }
  path()
  ctx.fillStyle = css(pal.tile)
  ctx.fill()
  if (logo) {
    ctx.save()
    path()
    ctx.clip()
    ctx.drawImage(logo, inset, inset, S - inset * 2, S - inset * 2)
    ctx.restore()
  } else {
    ctx.fillStyle = css(pal.muted)
    ctx.font = '700 72px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(sat.name.slice(0, 2).toUpperCase(), S / 2, S / 2 + 4)
  }
  if (sat.lit) {
    path()
    ctx.lineWidth = 10
    ctx.strokeStyle = css(pal.primary)
    ctx.stroke()
    // точка статуса: обводка цветом плитки, чтобы читалась на любом логотипе
    ctx.beginPath()
    ctx.arc(S - 46, 46, 24, 0, Math.PI * 2)
    ctx.fillStyle = css(sat.error ? pal.down : pal.up)
    ctx.fill()
    ctx.lineWidth = 9
    ctx.strokeStyle = css(pal.tile)
    ctx.stroke()
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/** Мягкая круглая точка — огоньки-сделки */
function dotTexture(): THREE.CanvasTexture {
  const S = 64
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const ctx = cv.getContext('2d')!
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.45, 'rgba(255,255,255,0.9)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S, S)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** Скруглённый квадрат (контур для объёмной плитки) */
function roundedSquare(w: number, r: number): THREE.Shape {
  const h = w / 2
  const s = new THREE.Shape()
  s.moveTo(-h + r, -h)
  s.lineTo(h - r, -h)
  s.quadraticCurveTo(h, -h, h, -h + r)
  s.lineTo(h, h - r)
  s.quadraticCurveTo(h, h, h - r, h)
  s.lineTo(-h + r, h)
  s.quadraticCurveTo(-h, h, -h, h - r)
  s.lineTo(-h, -h + r)
  s.quadraticCurveTo(-h, -h, -h + r, -h)
  return s
}

/** Наш значок объёмом: звезда (выдавленная, с фаской) + разорванный шестиугольник (трубки). Контуры — те же, что у LogoMark (viewBox 64) */
function buildLogo(starMat: THREE.Material, hexMat: THREE.Material, track: <T extends { dispose: () => void }>(x: T) => T): THREE.Group {
  const g = new THREE.Group()
  const k = 2.7 / 64 // 64 единицы значка → 2,7 единицы сцены
  const loader = new SVGLoader()
  const star = loader.parse(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="${LOGO_STAR}"/></svg>`)
  const shapes = star.paths.flatMap((p) => SVGLoader.createShapes(p))
  const starGeo = track(new THREE.ExtrudeGeometry(shapes, { depth: 5, bevelEnabled: true, bevelThickness: 1.4, bevelSize: 0.9, bevelSegments: 3, curveSegments: 10 }))
  starGeo.translate(-32, -32, -2.5)
  starGeo.scale(k, -k, k) // в SVG ось Y смотрит вниз
  starGeo.computeVertexNormals()
  g.add(new THREE.Mesh(starGeo, starMat))
  // шестиугольник: две ломаные (в пути есть V — разбираем тем же SVGLoader) → трубки по отрезкам
  const hex = loader.parse(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="${LOGO_HEX}"/></svg>`)
  for (const sub of hex.paths.flatMap((p) => p.subPaths)) {
    const pts = sub.getPoints().map((v) => new THREE.Vector3((v.x - 32) * k, -(v.y - 32) * k, 0))
    const path = new THREE.CurvePath<THREE.Vector3>()
    for (let i = 1; i < pts.length; i++) if (pts[i].distanceTo(pts[i - 1]) > 1e-6) path.add(new THREE.LineCurve3(pts[i - 1], pts[i]))
    g.add(new THREE.Mesh(track(new THREE.TubeGeometry(path, 32, 0.06, 8, false)), hexMat))
    // скругления на концах и в изломах
    for (const p of pts) {
      const ball = new THREE.Mesh(track(new THREE.SphereGeometry(0.06, 10, 8)), hexMat)
      ball.position.copy(p)
      g.add(ball)
    }
  }
  return g
}

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

const OUTER_R = 3.7
const INNER_R = 2.35
const TILT = 0.42 // наклон колец к зрителю, рад
const SPIN = 0.14 // самовращение, рад/с
const TRADE_EVERY = 2.6 // огонёк от каждой подключённой биржи — раз в столько секунд (с разбросом)
const TRADE_TIME = 1.4 // полёт огонька до центра, с
const TILE = 0.95 // сторона плитки

export function Planetarium3D({ sats, size, onOpen, onCenter, busy, labels, onFail }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  // то, что меняется без перерисовки React: читается в цикле кадров
  const live = useRef({ onOpen, onCenter, busy, focus: null as string | null, flash: 0 })
  live.current.onOpen = onOpen
  live.current.onCenter = onCenter
  live.current.busy = busy
  const [tip, setTip] = useState<{ id: string } | null>(null)
  const W = Math.round(size * 1.3)
  const key = sats.map((s) => `${s.id}:${s.lit ? 1 : 0}:${s.error ? 1 : 0}:${s.inner ? 1 : 0}`).join('|')

  useEffect(() => {
    const host = wrap.current
    if (!host) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
    } catch {
      onFail?.()
      return
    }
    // не больше 1,5 пикселя на точку: на ретине и 4K иначе в разы больше работы при той же картинке
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    renderer.setSize(W, size)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    const canvas = renderer.domElement
    canvas.setAttribute('aria-hidden', 'true')
    canvas.dataset.planetCanvas = ''
    canvas.style.touchAction = 'pan-y' // вертикальная прокрутка страницы пальцем не ломается
    host.prepend(canvas)

    const scene = new THREE.Scene()
    // кольца — эллипсы, поэтому сцена шире, чем выше; камера отодвинута — крайние биржи не обрезаются при наклоне
    const camera = new THREE.PerspectiveCamera(32, W / size, 0.1, 100)
    camera.position.set(0, 0.3, 13.6)

    let pal = readPalette()
    const dot = dotTexture()
    const disposables: { dispose: () => void }[] = [dot]
    const track = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x)

    // свет: мягкий общий + ключевой сверху слева (блики на гранях звезды и плиток) + контровой справа
    const amb = new THREE.AmbientLight(0xffffff, pal.dark ? 0.9 : 1.4)
    const key1 = new THREE.DirectionalLight(0xffffff, 2.2)
    key1.position.set(-4, 6, 9)
    const rim = new THREE.DirectionalLight(0xffffff, 0.9)
    rim.position.set(6, -2, -4)
    scene.add(amb, key1, rim)

    // мир: наклон к курсору / пальцу + вращение мышью
    const world = new THREE.Group()
    scene.add(world)
    const rings = new THREE.Group() // плоскость колец, наклонена к зрителю
    rings.rotation.x = TILT
    world.add(rings)

    // наш значок: металлическая звезда цвета кнопок + шестиугольник того же цвета
    const starMat = track(new THREE.MeshStandardMaterial({ color: pal.logo, metalness: 0.55, roughness: 0.3, emissive: pal.logo, emissiveIntensity: 0.12 }))
    const hexMat = track(new THREE.MeshStandardMaterial({ color: pal.logo, metalness: 0.4, roughness: 0.45, transparent: true, opacity: 0.75 }))
    const logo = buildLogo(starMat, hexMat, track)
    const coreHit = new THREE.Mesh(track(new THREE.SphereGeometry(1.35, 12, 12)), track(new THREE.MeshBasicMaterial({ visible: false })))
    coreHit.userData.core = true
    const centre = new THREE.Group()
    centre.add(logo, coreHit)
    world.add(centre)

    // кольца орбит — тонкие линии
    const ringMat = track(new THREE.LineBasicMaterial({ color: pal.muted, transparent: true, opacity: pal.dark ? 0.3 : 0.42 }))
    const circle = (r: number) => {
      const pts = Array.from({ length: 129 }, (_, i) => {
        const a = (i / 128) * Math.PI * 2
        return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)
      })
      return new THREE.Line(track(new THREE.BufferGeometry().setFromPoints(pts)), ringMat)
    }
    const outerRing = new THREE.Group()
    const innerRing = new THREE.Group()
    innerRing.rotation.z = -0.18 // внутреннее кольцо чуть под другим углом — объём
    outerRing.add(circle(OUTER_R))
    innerRing.add(circle(INNER_R))
    rings.add(outerRing, innerRing)

    // биржи: объёмная плитка (общая геометрия) + лицо с логотипом; плитка всегда повёрнута к камере
    const SLAB_D = 0.14
    const slabGeo = track(new THREE.ExtrudeGeometry(roundedSquare(TILE, 0.2), { depth: SLAB_D, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.035, bevelSegments: 2, curveSegments: 6 }))
    slabGeo.translate(0, 0, -SLAB_D)
    const faceGeo = track(new THREE.PlaneGeometry(TILE, TILE))
    type Sat = { data: PlanetSat; holder: THREE.Object3D; tile: THREE.Group; face: THREE.MeshBasicMaterial; slab: THREE.MeshStandardMaterial; hover: number; next: number }
    const satObjs: Sat[] = []
    const paintFace = (s: Sat) => {
      const url = exchangeLogoUrl(s.data.id)
      const set = (img: HTMLImageElement | null) => {
        const old = s.face.map
        s.face.map = track(faceTexture(s.data, pal, img))
        s.face.needsUpdate = true
        old?.dispose()
      }
      set(null)
      if (url) {
        const img = new Image()
        img.onload = () => set(img)
        img.src = url
      }
    }
    const groups = [sats.filter((s) => !s.inner), sats.filter((s) => s.inner)]
    groups.forEach((list, gi) => {
      const r = gi === 0 ? OUTER_R : INNER_R
      list.forEach((data, i) => {
        const a = (i / list.length) * Math.PI * 2 + gi * 0.5
        const holder = new THREE.Object3D()
        holder.position.set(Math.cos(a) * r, 0, Math.sin(a) * r)
        const slab = track(new THREE.MeshStandardMaterial({ color: data.lit ? pal.primary : pal.tile, metalness: 0.25, roughness: 0.5 }))
        const face = track(new THREE.MeshBasicMaterial({ transparent: true }))
        const tile = new THREE.Group()
        const slabMesh = new THREE.Mesh(slabGeo, slab)
        const faceMesh = new THREE.Mesh(faceGeo, face)
        faceMesh.position.z = 0.045
        faceMesh.userData.sat = data.id
        slabMesh.userData.sat = data.id
        tile.add(slabMesh, faceMesh)
        holder.add(tile)
        ;(gi === 0 ? outerRing : innerRing).add(holder)
        const sat: Sat = { data, holder, tile, face, slab, hover: 0, next: Math.random() * TRADE_EVERY }
        paintFace(sat)
        satObjs.push(sat)
      })
    })

    // огоньки-сделки: пул маленьких точек, летят от подключённой биржи к значку по дуге
    type Trade = { sprite: THREE.Sprite; from: THREE.Vector3; t: number; on: boolean }
    const tradeMat = track(new THREE.SpriteMaterial({ map: dot, color: pal.up, transparent: true, depthWrite: false }))
    const trades: Trade[] = Array.from({ length: 12 }, () => {
      const sprite = new THREE.Sprite(tradeMat)
      sprite.scale.setScalar(0.2)
      sprite.visible = false
      scene.add(sprite)
      return { sprite, from: new THREE.Vector3(), t: 0, on: false }
    })
    const ctrl = new THREE.Vector3()
    const centreW = new THREE.Vector3()
    const tmp = new THREE.Vector3()
    const quad = (a: THREE.Vector3, c: THREE.Vector3, b: THREE.Vector3, t: number, out: THREE.Vector3) => {
      const u = 1 - t
      return out.set(u * u * a.x + 2 * u * t * c.x + t * t * b.x, u * u * a.y + 2 * u * t * c.y + t * t * b.y, u * u * a.z + 2 * u * t * c.z + t * t * b.z)
    }

    // «Обновить все»: тонкая волна по плоскости колец
    const pulseMat = track(new THREE.MeshBasicMaterial({ color: pal.primary, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }))
    const pulse = new THREE.Mesh(track(new THREE.RingGeometry(0.97, 1, 128)), pulseMat)
    pulse.rotation.x = -Math.PI / 2
    rings.add(pulse)

    // ---------- ввод ----------
    const ray = new THREE.Raycaster()
    const ndc = new THREE.Vector2(9, 9)
    let inside = false
    let dragging = false
    let moved = 0
    let lastX = 0
    let spinVel = 0 // рад/с от перетаскивания, гаснет
    let spinOffset = 0
    let pointerMoved = true // луч мыши пересчитываем, только если мышь двигалась (или сцена повернулась)
    const tilt = { x: 0, y: 0, tx: 0, ty: 0 }
    let hovered: string | null = null // биржа или 'core'

    const toNdc = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    }
    const onMove = (e: PointerEvent) => {
      inside = true
      pointerMoved = true
      toNdc(e)
      tilt.tx = ndc.y * 0.2
      tilt.ty = ndc.x * 0.3
      if (dragging) {
        const dx = e.clientX - lastX
        lastX = e.clientX
        moved += Math.abs(dx)
        spinOffset += dx * 0.008
        spinVel = dx * 0.008 * 60
      }
    }
    const onDown = (e: PointerEvent) => {
      toNdc(e)
      dragging = true
      moved = 0
      lastX = e.clientX
      canvas.setPointerCapture(e.pointerId)
    }
    const onUp = (e: PointerEvent) => {
      if (!dragging) return
      dragging = false
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
      if (moved > 6) return // это было вращение, не нажатие
      toNdc(e)
      const hit = pick()
      if (hit === 'core') {
        live.current.flash = 1
        live.current.onCenter()
      } else if (hit) live.current.onOpen(hit)
    }
    const onLeave = () => {
      inside = false
      tilt.tx = tilt.ty = 0
      ndc.set(9, 9)
    }
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)
    canvas.addEventListener('pointerleave', onLeave)

    const targets = [coreHit, ...satObjs.flatMap((s) => s.tile.children)]
    function pick(): string | null {
      ray.setFromCamera(ndc, camera)
      const hit = ray.intersectObjects(targets, false)[0]
      if (!hit) return null
      return hit.object.userData.core ? 'core' : (hit.object.userData.sat as string)
    }

    // смена темы / палитры — перекрасить
    const recolor = () => {
      pal = readPalette()
      amb.intensity = pal.dark ? 0.9 : 1.4
      starMat.color.copy(pal.logo)
      starMat.emissive.copy(pal.logo)
      hexMat.color.copy(pal.logo)
      ringMat.color.copy(pal.muted)
      ringMat.opacity = pal.dark ? 0.3 : 0.42
      tradeMat.color.copy(pal.up)
      pulseMat.color.copy(pal.primary)
      for (const s of satObjs) {
        s.slab.color.copy(s.data.lit ? pal.primary : pal.tile)
        paintFace(s)
      }
    }
    const mo = new MutationObserver(recolor)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette'] })

    // рисуем только на экране и в видимой вкладке
    let visible = true
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting))
    io.observe(host)

    const still = reduced()
    const clock = new THREE.Clock()
    let raf = 0
    let frame = 0
    let lastTip: string | null = null
    let logoTurn = 0 // оборот значка по «Обновить все»
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (!visible || document.hidden) {
        clock.getDelta()
        return
      }
      const dt = Math.min(clock.getDelta(), 0.05)
      const tNow = clock.elapsedTime
      frame++

      // наведение: фокус с клавиатуры или луч мыши (раз в 3 кадра — сцена движется под неподвижной мышью)
      if (live.current.focus) hovered = live.current.focus
      else if (!inside || dragging) hovered = null
      else if (pointerMoved || frame % 3 === 0) {
        hovered = pick()
        pointerMoved = false
      }
      canvas.style.cursor = dragging ? 'grabbing' : hovered ? 'pointer' : 'grab'

      // вращение: само (замирает при наведении на биржу) + от перетаскивания с инерцией
      const holdSpin = hovered && hovered !== 'core' ? 0 : 1
      if (!dragging) {
        spinOffset += spinVel * dt
        spinVel *= Math.pow(0.04, dt) // инерция гаснет примерно за секунду
      }
      const auto = still ? 0 : SPIN * holdSpin * (live.current.busy ? 2.5 : 1)
      outerRing.rotation.y += auto * dt
      innerRing.rotation.y -= auto * 1.35 * dt
      rings.rotation.y = spinOffset

      // наклон за курсором — плавно
      const ease = Math.min(1, dt * 4)
      tilt.x += (tilt.tx - tilt.x) * ease
      tilt.y += (tilt.ty - tilt.y) * ease
      world.rotation.x = tilt.x
      world.rotation.y = tilt.y

      // значок: спокойно покачивается (видно объём), по «Обновить все» и пока идёт обновление — оборачивается
      const f = (live.current.flash = Math.max(0, live.current.flash - dt * 0.9))
      if (f > 0 || live.current.busy) logoTurn += dt * (live.current.busy ? 3.2 : 6 * f)
      else logoTurn += (Math.round(logoTurn / (Math.PI * 2)) * Math.PI * 2 - logoTurn) * Math.min(1, dt * 3) // докрутить до лица
      logo.rotation.y = (still ? 0 : Math.sin(tNow * 0.55) * 0.32) + logoTurn
      logo.rotation.x = still ? 0 : Math.sin(tNow * 0.4) * 0.08
      const coreHover = hovered === 'core' ? 1 : 0
      const cs = 1 + coreHover * 0.1
      centre.scale.lerp(tmp.set(cs, cs, cs), Math.min(1, dt * 8))
      starMat.emissiveIntensity = 0.12 + coreHover * 0.15 + f * 0.5
      pulseMat.opacity = f * 0.55
      pulse.scale.setScalar(1 + (1 - f) * OUTER_R)

      // плитки: повёрнуты к камере; крупнее при наведении; дальние — темнее (глубина)
      for (const s of satObjs) {
        const target = hovered === s.data.id ? 1 : 0
        s.hover += (target - s.hover) * Math.min(1, dt * 10)
        s.holder.getWorldPosition(tmp)
        // лицом к камере (lookAt принимает точку мира и сам учитывает повороты колец)
        s.tile.lookAt(camera.position)
        s.tile.scale.setScalar(1 + s.hover * 0.4)
        // глубина: z мира от −R (дальняя) до +R (ближняя) → яркость 0,55…1
        const depth = THREE.MathUtils.clamp((tmp.z + OUTER_R) / (OUTER_R * 2), 0, 1)
        const base = s.data.lit ? 1 : 0.82
        const light = Math.min(1, base * (0.55 + depth * 0.45) + s.hover * 0.3)
        s.face.color.setScalar(light)
      }

      // огоньки-сделки от подключённых бирж (без ошибки)
      centre.getWorldPosition(centreW)
      if (!still)
        for (const s of satObjs) {
          if (!s.data.lit || s.data.error) continue
          s.next -= dt
          if (s.next > 0) continue
          s.next = TRADE_EVERY * (0.7 + Math.random() * 0.8)
          const free = trades.find((x) => !x.on)
          if (!free) continue
          s.holder.getWorldPosition(free.from)
          free.t = 0
          free.on = true
          free.sprite.visible = true
        }
      for (const tr of trades) {
        if (!tr.on) continue
        tr.t += dt / TRADE_TIME
        if (tr.t >= 1) {
          tr.on = false
          tr.sprite.visible = false
          continue
        }
        // дуга: середина приподнята над плоскостью колец
        ctrl.copy(tr.from).add(centreW).multiplyScalar(0.5)
        ctrl.y += 1.1
        const e = tr.t * tr.t * (3 - 2 * tr.t)
        quad(tr.from, ctrl, centreW, e, tr.sprite.position)
        tr.sprite.material.opacity = Math.sin(tr.t * Math.PI)
      }

      renderer.render(scene, camera)

      // подпись над биржей / значком — следует за ней
      if (hovered !== lastTip) {
        lastTip = hovered
        setTip(hovered ? { id: hovered } : null)
      }
      const el = tipRef.current
      if (el && hovered) {
        const obj = hovered === 'core' ? centre : satObjs.find((s) => s.data.id === hovered)?.holder
        if (obj) {
          obj.getWorldPosition(tmp).project(camera)
          el.style.transform = `translate(${((tmp.x + 1) / 2) * W}px, ${((1 - tmp.y) / 2) * size}px) translate(-50%, calc(-100% - ${hovered === 'core' ? 48 : 34}px))`
        }
      }
    }
    tick()

    return () => {
      cancelAnimationFrame(raf)
      mo.disconnect()
      io.disconnect()
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('pointerleave', onLeave)
      for (const s of satObjs) s.face.map?.dispose()
      for (const d of disposables) d.dispose()
      renderer.dispose()
      canvas.remove()
    }
    // sats пересобираем только при смене состава / подсветки (key), не на каждую перерисовку
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, size, W])

  const tipSat = tip && tip.id !== 'core' ? sats.find((s) => s.id === tip.id) : null
  return (
    <div ref={wrap} data-planet className="relative shrink-0 select-none" style={{ width: W, height: size }}>
      {/* подпись: название и статус биржи / «Обновить все» */}
      <div
        ref={tipRef}
        role="status"
        aria-live="polite"
        className={`pointer-events-none absolute top-0 left-0 z-10 rounded-lg border border-border bg-surface/95 px-3 py-1.5 text-left whitespace-nowrap shadow-lg transition-opacity duration-150 ${tip ? 'opacity-100' : 'opacity-0'}`}
      >
        {tip?.id === 'core' ? (
          <span className="text-sm font-medium">{labels.center}</span>
        ) : tipSat ? (
          <>
            <span className="block text-sm font-semibold">{tipSat.name}</span>
            <span className={`block text-xs ${tipSat.error ? 'text-loss' : 'text-muted'}`}>{tipSat.status}</span>
          </>
        ) : null}
      </div>
      {/* клавиатура и экранные дикторы: невидимые кнопки, фокус подсвечивает биржу в сцене */}
      <ul aria-label={labels.scene} className="sr-only">
        <li>
          <button
            type="button"
            data-planet-core
            onFocus={() => (live.current.focus = 'core')}
            onBlur={() => (live.current.focus = null)}
            onClick={() => {
              live.current.flash = 1
              onCenter()
            }}
          >
            {labels.center}
          </button>
        </li>
        {sats.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              data-planet-sat={s.id}
              data-lit={s.lit ? 'on' : 'off'}
              onFocus={() => (live.current.focus = s.id)}
              onBlur={() => (live.current.focus = null)}
              onClick={() => onOpen(s.id)}
            >
              {s.name}: {s.status}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
