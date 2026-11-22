/**
 * «3D-планетарий» на странице «Биржи» (владелец 22.11.2026: «более крутую анимацию… с которой можно контактировать… 3D»;
 * выбор — планетарий на Three.js; образцы 21st.dev: cosmos-3d-orbit-gallery, radial-orbital-timeline, wireframe-dotted-globe).
 *
 * В центре — кристалл в шестиугольнике (наш значок), вокруг на двух наклонённых кольцах — логотипы бирж (ближние крупнее, дальние уходят за кристалл).
 * Подключённые подсвечены, от них к центру летят огоньки — сделки, которые приходят в дневник сами.
 *  - мышь над сценой — сцена наклоняется к курсору;
 *  - зажал и потянул (пальцем — так же) — крутится, отпустил — докручивается по инерции;
 *  - навёл на биржу — она крупнее, вращение замирает, подпись: название, статус, когда обновлялась;
 *  - нажал на биржу — её панель (onOpen); на кристалл — «Обновить все» (onCenter) со вспышкой.
 * Клавиатура и экранные дикторы — скрытые кнопки поверх (data-planet-sat / data-planet-core): фокус подсвечивает биржу так же, как наведение.
 * «Уменьшить движение» — без самовращения и огоньков; вне экрана и в фоне вкладки — не рисуем. Цвета — из токенов theme.css (обе темы, палитры).
 */
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { exchangeLogoUrl } from '@/components/ExchangeLogo'

export type PlanetSat = {
  id: string
  name: string
  /** подключена — подсветка и огоньки-сделки */
  lit: boolean
  /** вторая строка подписи: «Работает · обновлено 12 мин назад», «Не подключена — нажми, чтобы подключить» */
  status: string
  /** ошибка ключа — рамка цветом убытка */
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
  /** идёт «Обновить все» — кристалл крутится быстрее и светится */
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

type Palette = { primary: THREE.Color; tile: THREE.Color; border: THREE.Color; muted: THREE.Color; down: THREE.Color; up: THREE.Color; dark: boolean }
function readPalette(): Palette {
  return {
    primary: tokenColor('--color-primary'),
    tile: tokenColor('--color-surface-2'),
    border: tokenColor('--color-border'),
    muted: tokenColor('--color-muted'),
    down: tokenColor('--color-down'),
    up: tokenColor('--color-up'),
    dark: document.documentElement.dataset.theme !== 'light',
  }
}

const css = (c: THREE.Color) => `#${c.getHexString(THREE.SRGBColorSpace)}`

/** Плитка биржи: скруглённый квадрат цвета полей, логотип, рамка (подключена — цветом кнопок, ошибка — убытка) */
function tileTexture(sat: PlanetSat, pal: Palette, logo: HTMLImageElement | null): THREE.CanvasTexture {
  const S = 256
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const ctx = cv.getContext('2d')!
  const r = 52
  const path = () => {
    ctx.beginPath()
    ctx.roundRect(10, 10, S - 20, S - 20, r)
  }
  path()
  ctx.fillStyle = css(pal.tile)
  ctx.fill()
  if (logo) {
    ctx.save()
    path()
    ctx.clip()
    ctx.drawImage(logo, 10, 10, S - 20, S - 20)
    ctx.restore()
  } else {
    ctx.fillStyle = css(pal.muted)
    ctx.font = '700 72px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(sat.name.slice(0, 2).toUpperCase(), S / 2, S / 2 + 4)
  }
  path()
  ctx.lineWidth = sat.lit || sat.error ? 12 : 6
  ctx.strokeStyle = css(sat.error ? pal.down : sat.lit ? pal.primary : pal.border)
  ctx.stroke()
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/** Мягкое свечение (радиальный градиент) — для ореолов и огоньков; аддитивное смешивание */
function glowTexture(): THREE.CanvasTexture {
  const S = 128
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const ctx = cv.getContext('2d')!
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S, S)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

const OUTER_R = 3.7
const INNER_R = 2.35
const TILT = 0.42 // наклон колец к зрителю, рад
const SPIN = 0.16 // самовращение, рад/с
const TRADE_EVERY = 1.6 // огонёк от каждой подключённой биржи — раз в столько секунд (с разбросом)
const TRADE_TIME = 1.25 // полёт огонька до центра, с

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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(W, size)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    const canvas = renderer.domElement
    canvas.setAttribute('aria-hidden', 'true')
    canvas.dataset.planetCanvas = ''
    canvas.style.touchAction = 'pan-y' // вертикальная прокрутка страницы пальцем не ломается
    host.prepend(canvas)

    const scene = new THREE.Scene()
    // кольца — эллипсы, поэтому сцена шире, чем выше; камера дальше — крайние биржи не обрезаются при наклоне
    const camera = new THREE.PerspectiveCamera(32, W / size, 0.1, 100)
    camera.position.set(0, 0.3, 13.6)

    let pal = readPalette()
    const glow = glowTexture()
    const disposables: { dispose: () => void }[] = [glow]
    const track = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x)

    // свет: мягкий общий + направленный сверху справа + фиолетовый из центра
    const amb = new THREE.AmbientLight(0xffffff, 0.55)
    const dir = new THREE.DirectionalLight(0xffffff, 1.6)
    dir.position.set(4, 6, 8)
    const core = new THREE.PointLight(pal.primary, 18, 14, 1.6)
    scene.add(amb, dir, core)

    // мир: наклон к курсору / пальцу + вращение мышью
    const world = new THREE.Group()
    scene.add(world)
    const rings = new THREE.Group() // плоскость колец, наклонена к зрителю
    rings.rotation.x = TILT
    world.add(rings)

    // кристалл (наш значок): гранёный многогранник + шестиугольник вокруг, медленно вращаются
    const crystalMat = track(new THREE.MeshStandardMaterial({ color: pal.primary, metalness: 0.35, roughness: 0.28, flatShading: true, emissive: pal.primary, emissiveIntensity: 0.22 }))
    const crystal = new THREE.Mesh(track(new THREE.OctahedronGeometry(0.95, 0)), crystalMat)
    crystal.scale.set(0.8, 1.15, 0.8)
    const hexMat = track(new THREE.LineBasicMaterial({ color: pal.primary, transparent: true, opacity: 0.7 }))
    const hexPts = Array.from({ length: 7 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6
      return new THREE.Vector3(Math.cos(a) * 1.3, Math.sin(a) * 1.3, 0)
    })
    // «разорванный» шестиугольник, как в логотипе: открыт слева и справа
    const hex = new THREE.Group()
    for (const [a, b] of [[0, 1], [1, 2], [3, 4], [4, 5]] as const)
      hex.add(new THREE.Line(track(new THREE.BufferGeometry().setFromPoints(hexPts.slice(a, b + 1))), hexMat))
    const coreGlowMat = track(new THREE.SpriteMaterial({ map: glow, color: pal.primary, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }))
    const coreGlow = new THREE.Sprite(coreGlowMat)
    coreGlow.scale.setScalar(4.2)
    const coreHit = new THREE.Mesh(track(new THREE.SphereGeometry(1.3, 12, 12)), track(new THREE.MeshBasicMaterial({ visible: false })))
    coreHit.userData.core = true
    const centre = new THREE.Group()
    centre.add(coreGlow, crystal, hex, coreHit)
    world.add(centre)

    // кольца орбит
    const ringMat = track(new THREE.LineBasicMaterial({ color: pal.muted, transparent: true, opacity: pal.dark ? 0.32 : 0.45 }))
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

    // биржи: плитка (всегда лицом к зрителю) + ореол у подключённых
    type Sat = { data: PlanetSat; holder: THREE.Object3D; sprite: THREE.Sprite; halo: THREE.Sprite | null; mat: THREE.SpriteMaterial; hover: number; next: number }
    const satObjs: Sat[] = []
    const groups = [sats.filter((s) => !s.inner), sats.filter((s) => s.inner)]
    groups.forEach((list, gi) => {
      const r = gi === 0 ? OUTER_R : INNER_R
      list.forEach((data, i) => {
        const a = (i / list.length) * Math.PI * 2 + gi * 0.5
        const holder = new THREE.Object3D()
        holder.position.set(Math.cos(a) * r, 0, Math.sin(a) * r)
        const mat = track(new THREE.SpriteMaterial({ map: track(tileTexture(data, pal, null)), transparent: true }))
        const sprite = new THREE.Sprite(mat)
        sprite.scale.setScalar(0.95)
        sprite.userData.sat = data.id
        let halo: THREE.Sprite | null = null
        if (data.lit || data.error) {
          halo = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: glow, color: data.error ? pal.down : pal.primary, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })))
          halo.scale.setScalar(2)
          holder.add(halo)
        }
        holder.add(sprite)
        ;(gi === 0 ? outerRing : innerRing).add(holder)
        const sat: Sat = { data, holder, sprite, halo, mat, hover: 0, next: Math.random() * TRADE_EVERY }
        satObjs.push(sat)
        // логотип грузится из сборки (тот же адрес, что у <img>) — перерисовываем плитку, когда пришёл
        const url = exchangeLogoUrl(data.id)
        if (url) {
          const img = new Image()
          img.onload = () => {
            const old = mat.map
            mat.map = track(tileTexture(data, pal, img))
            mat.needsUpdate = true
            old?.dispose()
          }
          img.src = url
        }
      })
    })

    // огоньки-сделки: пул спрайтов, летят от подключённой биржи к кристаллу по дуге
    type Trade = { sprite: THREE.Sprite; from: THREE.Vector3; t: number; on: boolean }
    const tradeMat = track(new THREE.SpriteMaterial({ map: glow, color: pal.up, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
    const trades: Trade[] = Array.from({ length: 24 }, () => {
      const sprite = new THREE.Sprite(tradeMat)
      sprite.scale.setScalar(0.42)
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

    // вспышка «Обновить все»: кольцо, расходящееся от кристалла
    const pulseMat = track(new THREE.MeshBasicMaterial({ color: pal.primary, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }))
    const pulse = new THREE.Mesh(track(new THREE.RingGeometry(0.96, 1, 96)), pulseMat)
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
    const tilt = { x: 0, y: 0, tx: 0, ty: 0 }
    let hovered: string | null = null // биржа или 'core'

    const toNdc = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    }
    const onMove = (e: PointerEvent) => {
      inside = true
      toNdc(e)
      tilt.tx = ndc.y * 0.22
      tilt.ty = ndc.x * 0.32
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

    const targets = [coreHit, ...satObjs.map((s) => s.sprite)]
    function pick(): string | null {
      ray.setFromCamera(ndc, camera)
      const hit = ray.intersectObjects(targets, false)[0]
      if (!hit) return null
      return hit.object.userData.core ? 'core' : (hit.object.userData.sat as string)
    }

    // смена темы / палитры — перекрасить
    const recolor = () => {
      pal = readPalette()
      crystalMat.color.copy(pal.primary)
      crystalMat.emissive.copy(pal.primary)
      hexMat.color.copy(pal.primary)
      coreGlowMat.color.copy(pal.primary)
      core.color.copy(pal.primary)
      ringMat.color.copy(pal.muted)
      ringMat.opacity = pal.dark ? 0.32 : 0.45
      tradeMat.color.copy(pal.up)
      pulseMat.color.copy(pal.primary)
      for (const s of satObjs) {
        const url = exchangeLogoUrl(s.data.id)
        const paint = (img: HTMLImageElement | null) => {
          const old = s.mat.map
          s.mat.map = track(tileTexture(s.data, pal, img))
          s.mat.needsUpdate = true
          old?.dispose()
        }
        if (url) {
          const img = new Image()
          img.onload = () => paint(img)
          img.src = url
        } else paint(null)
        ;(s.halo?.material as THREE.SpriteMaterial | undefined)?.color.copy(s.data.error ? pal.down : pal.primary)
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
    let lastTip: string | null = null
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (!visible || document.hidden) {
        clock.getDelta()
        return
      }
      const dt = Math.min(clock.getDelta(), 0.05)
      const tNow = clock.elapsedTime

      // наведение (мышь) или фокус с клавиатуры
      hovered = live.current.focus ?? (inside && !dragging ? pick() : null)
      canvas.style.cursor = dragging ? 'grabbing' : hovered ? 'pointer' : 'grab'

      // вращение: само (замирает при наведении на биржу) + от перетаскивания с инерцией
      const holdSpin = hovered && hovered !== 'core' ? 0 : 1
      if (!dragging) {
        spinOffset += spinVel * dt
        spinVel *= Math.pow(0.04, dt) // инерция гаснет примерно за секунду
      }
      const auto = still ? 0 : SPIN * holdSpin * (live.current.busy ? 3 : 1)
      outerRing.rotation.y += auto * dt
      innerRing.rotation.y -= auto * 1.35 * dt
      rings.rotation.y = spinOffset

      // наклон за курсором — плавно
      tilt.x += (tilt.tx - tilt.x) * Math.min(1, dt * 4)
      tilt.y += (tilt.ty - tilt.y) * Math.min(1, dt * 4)
      world.rotation.x = tilt.x
      world.rotation.y = tilt.y

      // кристалл
      const spinCore = still ? 0 : live.current.busy ? 2.4 : 0.5
      crystal.rotation.y += spinCore * dt
      hex.rotation.z -= (still ? 0 : 0.12) * dt
      const coreHover = hovered === 'core' ? 1 : 0
      const cs = 1 + coreHover * 0.12
      centre.scale.lerp(tmp.set(cs, cs, cs), Math.min(1, dt * 8))
      live.current.flash = Math.max(0, live.current.flash - dt * 1.1)
      const f = live.current.flash
      crystalMat.emissiveIntensity = 0.22 + coreHover * 0.18 + f * 1.2 + (live.current.busy ? 0.25 + Math.sin(tNow * 6) * 0.1 : 0)
      coreGlowMat.opacity = 0.5 + coreHover * 0.2 + f * 0.4
      pulseMat.opacity = f * 0.8
      pulse.scale.setScalar(1 + (1 - f) * OUTER_R)

      // биржи: крупнее при наведении, ореол подключённых дышит
      for (const s of satObjs) {
        const target = hovered === s.data.id ? 1 : 0
        s.hover += (target - s.hover) * Math.min(1, dt * 10)
        s.sprite.scale.setScalar(0.95 * (1 + s.hover * 0.45))
        if (s.halo) (s.halo.material as THREE.SpriteMaterial).opacity = 0.35 + s.hover * 0.35 + (still ? 0 : Math.sin(tNow * 2 + s.next * 7) * 0.08)
      }

      // огоньки-сделки от подключённых бирж
      centre.getWorldPosition(centreW)
      if (!still)
        for (const s of satObjs) {
          if (!s.data.lit) continue
          s.next -= dt
          if (s.next > 0) continue
          s.next = TRADE_EVERY * (0.6 + Math.random() * 0.9)
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
        ctrl.y += 1.3
        const e = tr.t * tr.t * (3 - 2 * tr.t)
        quad(tr.from, ctrl, centreW, e, tr.sprite.position)
        tr.sprite.material.opacity = Math.sin(tr.t * Math.PI)
        tr.sprite.scale.setScalar(0.42 * (1 - tr.t * 0.6))
      }

      renderer.render(scene, camera)

      // подпись над биржей / кристаллом — следует за ней
      if (hovered !== lastTip) {
        lastTip = hovered
        setTip(hovered ? { id: hovered } : null)
      }
      const el = tipRef.current
      if (el && hovered) {
        const obj = hovered === 'core' ? centre : satObjs.find((s) => s.data.id === hovered)?.holder
        if (obj) {
          obj.getWorldPosition(tmp).project(camera)
          el.style.transform = `translate(${((tmp.x + 1) / 2) * W}px, ${((1 - tmp.y) / 2) * size}px) translate(-50%, calc(-100% - ${hovered === 'core' ? 46 : 30}px))`
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
      for (const s of satObjs) s.mat.map?.dispose()
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
