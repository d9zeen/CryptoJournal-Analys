/**
 * «Спираль времени» на странице «Биржи» (владелец 25.11.2026 вместо планетария с глазом; до этого отклонил «Башни бирж»:
 * «вообще не нравятся столбцы»; выбор из четырёх идей — «Спираль времени»).
 *
 * Сделки последних 30 дней нанизаны на тонкую нить, закрученную спиралью:
 *  - сделка — гранёный камень-ромб: плюс — --color-up, минус — --color-down, крупнее — больше сумма; камни медленно поворачиваются (грани ловят свет);
 *  - свежая — слева спереди сверху, старые закручиваются вниз и вглубь, бледнеют, низ растворяется в фоне карточки; у четырёх последних — подпись суммы и монеты;
 *  - на нити — черты дней («сегодня», «вчера», «22.11»);
 *  - при открытии нить вырастает из глубины и камни загораются, затем последние сделки приходят по одной: камень опускается на кончик нити,
 *    тонкое кольцо, спираль проворачивается на шаг (время уходит вглубь). Новые сделки от синхронизации приходят так же;
 *  - мышь: наведение на камень — карточка сделки, клик — страница сделки; колесо — назад во времени («К свежим ↑» — вернуться);
 *    потянуть — повернуть (с инерцией); вся сцена чуть наклоняется за мышью. Наведение на биржу в списке рядом (focus) — горят только её сделки;
 *  - «Обновить» в углу сцены: кольцо света проходит по спирали снизу вверх, дальше — пришедшие сделки.
 * Палец: касание камня — карточка, второе касание — сделка; тянуть вбок — поворот, вертикальная прокрутка страницы не ломается.
 * Клавиатура и дикторы — скрытые кнопки последних сделок (data-spiral-trade): фокус = наведение, Enter — сделка.
 * «Уменьшить движение» — без роста, полётов, колец и самовращения. Вне экрана и в фоновой вкладке не рисуем; пиксели ≤ 1,5×.
 * Цвета — токены theme.css, перекрашивается при смене темы / палитры. Образцы — в docs/PLAN.md (раздел «Биржи»).
 */
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { exchangeLogoUrl } from '@/components/ExchangeLogo'
import { formatPnl, formatPnlShort } from '@/lib/format'

export type SpiralTrade = {
  id: string
  exchange: string
  /** название биржи для подсказки */
  exName: string
  /** коротко для подписи у камня: BTC */
  label: string
  /** полностью для подсказки: BTCUSDT */
  symbol: string
  /** Long / Short */
  side: string
  pnl: number
  /** день закрытия YYYY-MM-DD в поясе пользователя — черты дней на нити */
  day: string
  /** «сегодня, 14:05» — для подсказки */
  when: string
}

type Props = {
  /** от старых к новым */
  trades: SpiralTrade[]
  /** подпись черты дня: «сегодня», «вчера», «22.11» */
  dayLabel: (day: string) => string
  /** высота сцены; ширина — в 1,3 раза больше */
  size: number
  /** биржа под мышью в списке рядом — горят только её сделки */
  focus: string | null
  busy: boolean
  onOpenTrade: (id: string) => void
  onRefresh: () => void
  labels: { scene: string; refresh: string; back: string; empty: string }
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

// геометрия спирали: K сделок на виток, шаг по высоте DY, радиус R; свежая — со сдвигом PH (слева спереди)
const K = 11
const TH_STEP = (Math.PI * 2) / K
const DY = 0.2
const R = 2.25
const Y_TOP = 0.75
const PH = -1.6 * TH_STEP
const S0 = -2.5
const SEG_PER = 12
const RAD = 6
const REPLAY = 8
/** расстояние камеры: спираль занимает сцену по высоте (подписи сверху не обрезаются) */
const CAM_D = 10.2
const local = (s: number, out = new THREE.Vector3(), r = R) => out.set(r * Math.sin(-s * TH_STEP + PH), s * DY, r * Math.cos(-s * TH_STEP + PH))
const easeOut = (k: number) => 1 - Math.pow(1 - k, 3)
const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2)
const spring = (k: number) => 1 - Math.cos(k * Math.PI * 3.2) * Math.exp(-k * 6)

type Gem = THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshPhysicalMaterial> & {
  userData: { tr: SpiralTrade; s: number; size: number; mode: 'grow' | 'arrive' | 'still'; t0: number; f: number; hs: number; phase: number; landed: boolean }
}

export function TimeSpiral3D({ trades, dayLabel, size, focus, busy, onOpenTrade, onRefresh, labels, onFail }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const live = useRef({ trades, dayLabel, focus, busy, onOpenTrade, sel: null as string | null })
  live.current.trades = trades
  live.current.dayLabel = dayLabel
  live.current.focus = focus
  live.current.busy = busy
  live.current.onOpenTrade = onOpenTrade
  const [canBack, setCanBack] = useState(false)
  const [sel, setSel] = useState<string | null>(null)
  live.current.sel = sel
  const W = Math.round(size * 1.3)
  const small = size < 330

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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    renderer.setSize(W, size)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    const canvas = renderer.domElement
    canvas.setAttribute('aria-hidden', 'true')
    canvas.dataset.spiralCanvas = ''
    canvas.style.touchAction = 'pan-y'
    host.prepend(canvas)

    const still = reduced()
    let C = readPalette()
    const disposables: { dispose: () => void }[] = []
    const track = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x)

    const scene = new THREE.Scene()
    const fog = new THREE.Fog(C.surface, 8.8, 15.5)
    scene.fog = fog
    const pm = track(new THREE.PMREMGenerator(renderer))
    const envTex = track(pm.fromScene(new RoomEnvironment(), 0.04).texture)
    scene.environment = envTex
    const key = new THREE.DirectionalLight(0xffffff, 1.5)
    key.position.set(-5, 8, 9)
    const rim = new THREE.DirectionalLight(0xffffff, 0.6)
    rim.position.set(6, 3, -6)
    const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 0.6)
    scene.add(key, rim, hemi)
    const lightUp = () => {
      scene.environmentIntensity = C.light ? 0.75 : 0.6
      key.intensity = C.light ? 1.6 : 1.4
      rim.intensity = C.light ? 0.5 : 0.8
      hemi.groundColor.copy(C.base)
      hemi.intensity = C.light ? 0.7 : 0.5
      fog.color.copy(C.surface)
    }
    lightUp()
    const camera = new THREE.PerspectiveCamera(30, W / size, 0.1, 60)
    const LOOK = new THREE.Vector3(0, -0.9, 0)

    const helix = new THREE.Group()
    scene.add(helix)

    // нить времени: строится с запасом вперёд, видна до кончика (последней сделки)
    let S1 = 0
    let spineGeo: THREE.TubeGeometry | null = null
    const spineMat = track(new THREE.MeshBasicMaterial({ color: C.muted, transparent: true, opacity: 0.5 }))
    const spine = new THREE.Mesh(new THREE.BufferGeometry(), spineMat)
    helix.add(spine)
    const buildSpine = (n: number) => {
      const need = n + 20
      if (spineGeo && need <= S1) return
      S1 = need + 20
      spineGeo?.dispose()
      const pts = Array.from({ length: Math.round((S1 - S0) * 2) + 1 }, (_, i) => local(S0 + i / 2))
      spineGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.round((S1 - S0) * SEG_PER), 0.016, RAD, false)
      spine.geometry = spineGeo
    }
    const setTip = (s: number) => spineGeo?.setDrawRange(0, Math.max(0, Math.floor((s - S0) * SEG_PER)) * RAD * 6)
    const tipMat = track(new THREE.MeshBasicMaterial({ color: C.primary }))
    const tipDot = new THREE.Mesh(track(new THREE.SphereGeometry(0.05, 16, 12)), tipMat)
    helix.add(tipDot)
    const axisMat = track(new THREE.LineBasicMaterial({ color: C.muted, transparent: true, opacity: 0.22 }))
    const axisGeo = track(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, S0 * DY - 0.6, 0), new THREE.Vector3(0, 400 * DY, 0)]))
    helix.add(new THREE.Line(axisGeo, axisMat))

    // HTML поверх сцены: подписи камней, черты дней, подсказка
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
    tip.dataset.spiralTip = ''

    // черты дней
    type Day = { s: number; el: HTMLDivElement; anchor: THREE.Object3D; line: THREE.Line }
    let days: Day[] = []
    const clearDays = () => {
      for (const d of days) {
        d.el.remove()
        d.line.geometry.dispose()
        helix.remove(d.line, d.anchor)
      }
      days = []
    }
    const addDay = (s: number, label: string) => {
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([local(s, undefined, R * 0.93), local(s, undefined, R * 1.07)]), axisMat)
      helix.add(line)
      const anchor = new THREE.Object3D()
      local(s, anchor.position, R * 1.06)
      helix.add(anchor)
      const el = mk('pointer-events-none absolute left-0 top-0 z-[1] whitespace-nowrap text-xs text-muted')
      el.textContent = label
      days.push({ s, el, anchor, line })
    }

    // камни-сделки
    const gemGeo = track(new THREE.OctahedronGeometry(1, 0))
    gemGeo.scale(0.62, 1, 0.62)
    let gems: Gem[] = []
    let maxAbs = 1 // наибольшая сумма среди сделок — масштаб камней
    const baseOf = (pnl: number) => (pnl >= 0 ? C.up : C.down).clone().lerp(C.base, C.light ? 0.06 : 0.1)
    const sizeOf = (pnl: number) => 0.13 + 0.17 * Math.sqrt(Math.min(1, Math.abs(pnl) / maxAbs))
    const bases = new Map<Gem, THREE.Color>()

    let head = 0
    let headT = 0
    let tip$ = S0
    let tipT = S0
    let started = performance.now()
    let growUntil = 0
    let first = true
    const queue: { at: number; id: string }[] = []

    /** сделки пришли / поменялись: новые камни, порядок, черты дней */
    let seen = ''
    const sync = (now: number) => {
      const list = live.current.trades
      const sig = list.map((x) => x.id + ':' + x.pnl).join('|')
      if (sig === seen) return
      seen = sig
      maxAbs = Math.max(1, ...list.map((x) => Math.abs(x.pnl)))
      const byId = new Map(gems.map((g) => [g.userData.tr.id, g]))
      const next: Gem[] = []
      const fresh: Gem[] = []
      list.forEach((tr, s) => {
        let g = byId.get(tr.id)
        if (g) byId.delete(tr.id)
        else {
          const mat = new THREE.MeshPhysicalMaterial({ roughness: 0.22, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.1, flatShading: true })
          g = new THREE.Mesh(gemGeo, mat) as unknown as Gem
          g.userData = { tr, s, size: 0, mode: 'still', t0: now, f: 1, hs: 1, phase: s * 1.7, landed: false }
          g.scale.setScalar(0.0001)
          helix.add(g)
          fresh.push(g)
        }
        g.userData.tr = tr
        g.userData.s = s
        g.userData.size = sizeOf(tr.pnl)
        bases.set(g, baseOf(tr.pnl))
        next.push(g)
      })
      for (const g of byId.values()) {
        helix.remove(g)
        g.material.dispose()
        bases.delete(g)
      }
      gems = next
      buildSpine(gems.length)
      // черты дней: между сделками разных дней + перед самой первой
      clearDays()
      list.forEach((tr, s) => {
        if (s === 0 || list[s - 1].day !== tr.day) addDay(s - 0.5, live.current.dayLabel(tr.day))
      })
      const n = gems.length
      if (first) {
        // первый показ: все, кроме последних REPLAY, «растут» по ходу нити; последние — приходят по одной
        first = false
        const rep = still ? 0 : Math.min(REPLAY, Math.max(0, n - 3))
        const growN = n - rep
        started = now
        growUntil = still ? now : now + 1900
        head = headT = Math.max(0, growN - 1)
        tipT = growN - 1 + 0.35
        tip$ = still ? tipT : S0
        fresh.forEach((g) => {
          if (g.userData.s < growN) g.userData.mode = still ? 'still' : 'grow'
          else queue.push({ at: growUntil + 450 + (g.userData.s - growN) * 700, id: g.userData.tr.id })
        })
        if (still) fresh.forEach((g) => g.scale.setScalar(1))
      } else {
        // потом: новые сделки — по одной на кончик нити (если их немного), остальное — сразу
        const latest = fresh.filter((g) => g.userData.s >= n - 10).sort((a, b) => a.userData.s - b.userData.s)
        let at = Math.max(now, queue.length ? queue[queue.length - 1].at + 700 : now) + (live.current.busy ? 900 : 0)
        fresh.forEach((g) => {
          if (!still && latest.includes(g)) {
            queue.push({ at, id: g.userData.tr.id })
            at += 700
          } else {
            g.userData.mode = 'still'
            g.userData.landed = true
          }
        })
        if (!queue.length) {
          headT = n - 1
          tipT = n - 1 + 0.35
        }
      }
      host.dataset.spiralCount = String(n)
    }

    // всплески: кольцо при посадке, след прилёта, кольцо «Обновить»
    const flashGeo = track(new THREE.RingGeometry(0.22, 0.232, 48))
    const flashes: { m: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>; t0: number }[] = []
    const flash = (g: Gem, now: number) => {
      if (still) return
      const m = new THREE.Mesh(flashGeo, new THREE.MeshBasicMaterial({ color: C.primary, transparent: true, opacity: 0.6, depthWrite: false, fog: false }))
      g.getWorldPosition(m.position)
      scene.add(m)
      flashes.push({ m, t0: now })
    }
    const trailGeo = track(new THREE.PlaneGeometry(0.03, 2.2))
    trailGeo.translate(0, 1.1, 0)
    const trails: { m: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; t0: number }[] = []
    const scanMat = track(new THREE.MeshBasicMaterial({ color: C.primary, transparent: true, opacity: 0, fog: false }))
    const scan = new THREE.Mesh(track(new THREE.TorusGeometry(R + 0.05, 0.012, 8, 120)), scanMat)
    scan.rotation.x = Math.PI / 2
    scene.add(scan)
    let scanT = -1
    let wasBusy = false

    const recolor = () => {
      C = readPalette()
      lightUp()
      spineMat.color.copy(C.muted)
      axisMat.color.copy(C.muted)
      tipMat.color.copy(C.primary)
      scanMat.color.copy(C.primary)
      for (const g of gems) bases.set(g, baseOf(g.userData.tr.pnl))
    }
    const mo = new MutationObserver(recolor)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette'] })

    // мышь и палец
    const ray = new THREE.Raycaster()
    const ndc = new THREE.Vector2(9, 9)
    let inside = false
    let moved = true
    let drag: { x: number; y: number; moved: number; type: string } | null = null
    let yaw = 0
    let yawV = 0
    let view = 0
    let viewT = 0
    let hit: Gem | null = null
    const setNdc = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      moved = true
    }
    const onMove = (e: PointerEvent) => {
      setNdc(e)
      inside = e.pointerType === 'mouse'
      if (drag) {
        const dx = e.clientX - drag.x
        drag.x = e.clientX
        drag.moved += Math.abs(dx) + Math.abs(e.clientY - drag.y)
        drag.y = e.clientY
        yawV = dx * 0.006
        yaw += yawV
      }
    }
    const onDown = (e: PointerEvent) => {
      setNdc(e)
      drag = { x: e.clientX, y: e.clientY, moved: 0, type: e.pointerType }
    }
    const onUp = (e: PointerEvent) => {
      const d = drag
      drag = null
      if (!d || d.moved > 6) return
      setNdc(e)
      const g = pick()
      if (!g) return setSel(null)
      const id = g.userData.tr.id
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
    const onWheel = (e: WheelEvent) => {
      const n = gems.length
      const max = Math.max(0, n - 8)
      const nextV = Math.max(0, Math.min(max, viewT + e.deltaY / 40))
      // дошли до края времени — отпускаем прокрутку страницы
      if (nextV === viewT) return
      e.preventDefault()
      viewT = nextV
    }
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointerleave', onLeave)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    const backTo = () => (viewT = 0)
    host.addEventListener('spiral-back', backTo)

    const pick = (): Gem | null => {
      ray.setFromCamera(ndc, camera)
      return (ray.intersectObjects(gems, false)[0]?.object as Gem | undefined) ?? null
    }

    let visible = true
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting))
    io.observe(host)

    const v3 = new THREE.Vector3()
    const toScreen = (o: THREE.Object3D) => {
      o.getWorldPosition(v3).project(camera)
      return { x: ((v3.x + 1) / 2) * W, y: ((1 - v3.y) / 2) * size }
    }
    let tiltX = 0
    let tiltY = 0
    let raf = 0
    let frame = 0
    let lastBack = false
    let lastTipId = ''
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (!visible || document.hidden) return
      frame++
      sync(now)
      const t = now - started
      // нить растёт к последней «выросшей» сделке, камни загораются, когда нить их достигает
      if (now < growUntil) tip$ = S0 + (tipT - S0) * easeInOut(1 - (growUntil - now) / 1900)
      else tip$ += (tipT - tip$) * (still ? 1 : 0.09)
      while (queue.length && queue[0].at <= now) {
        const q = queue.shift()!
        const g = gems.find((x) => x.userData.tr.id === q.id)
        if (!g) continue
        g.userData.mode = 'arrive'
        g.userData.t0 = now
        headT = g.userData.s
        tipT = g.userData.s + 0.35
        if (!still) {
          const tr = new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({ color: C.primary, transparent: true, opacity: 0, depthWrite: false }))
          local(g.userData.s, tr.position)
          helix.add(tr)
          trails.push({ m: tr, t0: now })
        }
      }
      setTip(tip$)
      local(tip$, tipDot.position)
      // «Обновить» — кольцо света снизу вверх
      const b = live.current.busy
      if (b && !wasBusy && !still) {
        scanT = now
        viewT = 0
      }
      wasBusy = b
      head += (headT - head) * (still ? 1 : 0.075)
      view += (viewT - view) * (still ? 1 : 0.1)
      const back = viewT > 0.5
      if (back !== lastBack) {
        lastBack = back
        setCanBack(back)
      }
      if (!drag) {
        yawV *= 0.94
        yaw += yawV
      }
      const tx = inside ? ndc.y * 0.06 : 0
      const ty = inside ? ndc.x * 0.1 : 0
      tiltX += (tx - tiltX) * 0.05
      tiltY += (ty - tiltY) * 0.05
      const hv = head - view
      helix.rotation.y = hv * TH_STEP + yaw + (still ? 0 : Math.sin((t / 1000) * 0.35) * 0.05)
      helix.position.y = Y_TOP - hv * DY
      const el = 0.3 + tiltX
      camera.position.set(Math.sin(tiltY) * CAM_D * Math.cos(el), LOOK.y + Math.sin(el) * CAM_D, Math.cos(tiltY) * CAM_D * Math.cos(el))
      camera.lookAt(LOOK)
      scene.updateMatrixWorld()

      // наведение: мышь (раз в 2 кадра и при движении — спираль двигается под мышью), иначе — выбранная пальцем / с клавиатуры
      if (drag && drag.moved > 6) hit = null
      else if (moved || frame % 2 === 0) {
        hit = inside ? pick() : null
        moved = false
      }
      const selId = live.current.sel
      const target = hit ?? (selId ? gems.find((g) => g.userData.tr.id === selId) ?? null : null)
      const focusEx = target ? null : live.current.focus
      canvas.style.cursor = hit ? 'pointer' : drag ? 'grabbing' : 'grab'

      for (const g of gems) {
        const u = g.userData
        const age = Math.max(0, hv - u.s)
        let s = u.size * (1 - 0.28 * Math.min(1, age / 30))
        let lift = 0
        if (u.mode === 'grow') {
          if (tip$ + 0.2 < u.s) s = 0.0001
          else {
            if (!u.landed) {
              u.landed = true
              u.t0 = now
            }
            s *= Math.max(0.0001, Math.min(1.06, spring(Math.min(1, (now - u.t0) / 520))))
          }
        } else if (u.mode === 'arrive') {
          const k = Math.min(1, (now - u.t0) / 900)
          lift = (1 - easeOut(Math.min(1, k / 0.55))) * 1.8
          s *= k < 0.55 ? 0.55 + 0.45 * (k / 0.55) : 1 + Math.sin(((k - 0.55) / 0.45) * Math.PI) * 0.18 * (1 - k)
          if (!u.landed && k >= 0.55) {
            u.landed = true
            flash(g, now)
          }
        } else if (queue.some((q) => q.id === u.tr.id)) s = 0.0001
        const isHit = g === target
        u.hs += ((isHit ? 1.35 : 1) - u.hs) * 0.2
        g.scale.setScalar(s * u.hs)
        local(u.s, g.position)
        g.position.y += lift
        g.rotation.y = still ? u.phase : (now / 1000) * 0.45 + u.phase
        const on = focusEx ? u.tr.exchange === focusEx : !target || isHit || target.userData.tr.exchange === u.tr.exchange ? 1 : 0.35
        u.f += (Number(on) - u.f) * 0.15
        const fade = Math.min(C.light ? 0.45 : 0.6, age / (C.light ? 40 : 34))
        g.material.color.copy(bases.get(g)!).lerp(C.surface, fade).lerp(C.base, (1 - u.f) * 0.75)
      }
      for (let i = flashes.length - 1; i >= 0; i--) {
        const f = flashes[i]
        const k = (now - f.t0) / 850
        f.m.lookAt(camera.position)
        f.m.scale.setScalar(1 + easeOut(Math.min(1, k)) * 1.2)
        f.m.material.opacity = 0.6 * (1 - Math.min(1, k))
        if (k > 1) {
          scene.remove(f.m)
          f.m.material.dispose()
          flashes.splice(i, 1)
        }
      }
      for (let i = trails.length - 1; i >= 0; i--) {
        const tr = trails[i]
        const k = (now - tr.t0) / 650
        tr.m.material.opacity = k < 1 ? 0.5 * Math.sin(Math.PI * k) : 0
        tr.m.rotation.y = -helix.rotation.y
        if (k > 1) {
          helix.remove(tr.m)
          tr.m.material.dispose()
          trails.splice(i, 1)
        }
      }
      if (scanT >= 0) {
        const k = (now - scanT) / 1250
        const top = Y_TOP + 0.2
        const bot = Y_TOP - 22 * DY
        scan.position.y = bot + (top - bot) * easeInOut(Math.min(1, k))
        scanMat.opacity = k < 1 ? 0.75 * Math.sin(Math.PI * Math.min(1, k)) : 0
        if (k >= 1.05) scanT = -1
      }

      renderer.render(scene, camera)

      // подписи четырёх последних (видимых) сделок
      const order = gems
        .filter((g) => g.userData.mode !== 'arrive' || g.userData.landed)
        .filter((g) => g.userData.s <= hv + 0.5 && g.scale.x > 0.01)
        .sort((a, b) => b.userData.s - a.userData.s)
      gls.forEach((el, i) => {
        const g = order[i]
        if (!g || target || focusEx) {
          el.style.opacity = '0'
          return
        }
        const u = g.userData
        const p = toScreen(g)
        const html = `<span class="${u.tr.pnl >= 0 ? 'text-up' : 'text-down'} num">${formatPnlShort(u.tr.pnl)}</span><span class="font-medium text-muted">${esc(u.tr.label)}</span>`
        if (el.dataset.k !== u.tr.id) {
          el.innerHTML = html
          el.dataset.k = u.tr.id
        }
        el.style.transform = `translate(${p.x}px, ${p.y - u.size * 34 * u.hs}px) translate(-50%, -100%)`
        el.style.opacity = String([1, 0.78, 0.58, 0.4][i] * Math.min(1, u.f))
      })
      for (const d of days) {
        d.anchor.getWorldPosition(v3)
        const z = v3.z
        const y = v3.y
        const p = toScreen(d.anchor)
        const age = hv - d.s
        const vis = z > 0.9 && age > -0.6 && age < 26 && y > -4.3 && y < 2.6 && !target && !focusEx
        d.el.style.transform = `translate(${p.x + 10}px, ${p.y}px) translate(0, -50%)`
        d.el.style.opacity = vis ? String(Math.max(0, Math.min(1, (z - 0.9) / 0.8)) * (1 - age / 30)) : '0'
      }
      // карточка сделки
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
        const x = Math.max(90, Math.min(W - 90, p.x))
        tip.style.transform = `translate(${x}px, ${p.y - target.userData.size * 30}px) translate(-50%, calc(-100% - 16px))`
        tip.style.opacity = '1'
        host.dataset.spiralHover = tr.id
      } else {
        tip.style.opacity = '0'
        lastTipId = ''
        delete host.dataset.spiralHover
      }
    }
    raf = requestAnimationFrame(tick)
    host.dataset.spiralReady = ''

    return () => {
      cancelAnimationFrame(raf)
      mo.disconnect()
      io.disconnect()
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('wheel', onWheel)
      host.removeEventListener('spiral-back', backTo)
      clearDays()
      ;[...gls, tip].forEach((el) => el.remove())
      for (const g of gems) g.material.dispose()
      for (const f of flashes) f.m.material.dispose()
      for (const tr of trails) tr.m.material.dispose()
      spineGeo?.dispose()
      disposables.forEach((d) => d.dispose())
      renderer.dispose()
      canvas.remove()
      delete host.dataset.spiralReady
    }
    // сцена строится один раз на размер; сделки, фокус и «идёт обновление» читаются из live в цикле кадров
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, size, small])

  // для клавиатуры и дикторов — последние сделки кнопками; фокус = наведение
  const recent = trades.slice(-12).reverse()
  return (
    <div ref={wrap} data-spiral role="group" aria-label={labels.scene} className="relative overflow-hidden" style={{ width: W, height: size, maxWidth: '100%' }}>
      <button
        type="button"
        data-spiral-refresh
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
      <button
        type="button"
        data-spiral-back
        onClick={() => wrap.current?.dispatchEvent(new Event('spiral-back'))}
        tabIndex={canBack ? 0 : -1}
        aria-hidden={!canBack}
        className={`absolute right-3 top-3 z-[3] h-8 rounded-lg border border-border bg-surface px-3 text-xs font-semibold transition-[opacity,transform] duration-200 hover:border-primary ${canBack ? 'opacity-100' : 'pointer-events-none -translate-y-1 opacity-0'}`}
      >
        {labels.back}
      </button>
      {/* низ спирали растворяется в фоне карточки — время уходит вглубь */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-[35%] bg-linear-to-b from-transparent from-0% to-surface to-90%" />
      {!trades.length && <p className="absolute inset-x-0 top-[38%] z-[2] px-6 text-center text-sm text-muted">{labels.empty}</p>}
      <ul className="sr-only">
        {recent.map((tr) => (
          <li key={tr.id}>
            <button
              type="button"
              data-spiral-trade={tr.id}
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
