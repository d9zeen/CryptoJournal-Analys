import { useEffect, useRef } from 'react'
import { AsciiEye, parseHex, type EyeColors, type Gaze, type Rgb } from '@/lib/asciiEye'
import { prefersReducedMotion } from '@/lib/motion'

/**
 * Значок-глаз из символов кода (22.11.2026, вариант A владельца): вместо звезды в плитке логотипа — живой глаз.
 * Следит за курсором по всей странице, моргает, рядом с курсором щурится; нажатие — моргнул. Мышь не двигается 5 с — засыпает
 * (веко закрыто), шевельнёшь — просыпается. На сенсорном экране не спит: смотрит по сторонам, касание — смотрит туда.
 * «Уменьшить движение» — один открытый кадр без анимации. Невидимый (скрыт по ширине, ниже экрана) — не рисуется.
 * Цвета — токены --color-eye-* (theme.css), шрифт — --font-mono. Движок — lib/asciiEye.ts.
 */

const SLEEP_MS = 5000
const TOUCH_LOOK_MS = 2000

type Instance = { eye: AsciiEye; canvas: HTMLCanvasElement; visible: boolean }

const instances = new Set<Instance>()
const pointer = { x: 0, y: 0, has: false, last: typeof performance !== 'undefined' ? performance.now() : 0 }
let raf = 0
let lastFrame = 0
let listening = false

function isTouch() {
  return window.matchMedia('(hover: none)').matches
}

function onPointer(e: PointerEvent) {
  pointer.x = e.clientX
  pointer.y = e.clientY
  pointer.has = true
  pointer.last = performance.now()
}
function onKey() {
  pointer.last = performance.now()
}

function listen() {
  if (listening) return
  listening = true
  window.addEventListener('pointermove', onPointer, { passive: true })
  window.addEventListener('pointerdown', onPointer, { passive: true })
  window.addEventListener('keydown', onKey, { passive: true })
}

/** Цвета глаза из токенов theme.css */
function readColors(): EyeColors {
  const css = getComputedStyle(document.documentElement)
  const get = (name: string): Rgb => parseHex(css.getPropertyValue(`--color-eye-${name}`)) ?? [0, 0, 0]
  return {
    sclera: get('sclera'),
    irisCore: get('iris-core'),
    iris: get('iris'),
    irisEdge: get('iris-edge'),
    lid: get('lid'),
    pupil: get('pupil'),
    glow: get('glow'),
    glint: get('glint'),
    tile: get('tile'),
  }
}

function monoFont() {
  return getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim() || 'monospace'
}

/** Шаг одного глаза: куда смотреть, открыт ли, щурится ли */
function stepOne(inst: Instance, dt: number, now: number) {
  const r = inst.canvas.getBoundingClientRect()
  const touch = isTouch()
  const fresh = now - pointer.last
  let gaze: Gaze = null
  let near = false
  if (pointer.has && (!touch || fresh < TOUCH_LOOK_MS)) {
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    gaze = { dx: (pointer.x - cx) / (r.width / 2 || 1), dy: -(pointer.y - cy) / (r.height / 2 || 1) }
    near = !touch && Math.hypot(pointer.x - cx, pointer.y - cy) < r.width * 0.9
  }
  inst.eye.step(dt, gaze, touch || fresh < SLEEP_MS, near)
  inst.eye.draw()
}

function loop(now: number) {
  const dt = Math.min(0.05, (now - (lastFrame || now)) / 1000)
  lastFrame = now
  for (const inst of instances) if (inst.visible) stepOne(inst, dt, now)
  raf = instances.size ? requestAnimationFrame(loop) : 0
}

function start() {
  if (!raf && !prefersReducedMotion()) {
    lastFrame = 0
    raf = requestAnimationFrame(loop)
  }
}

export function EyeMark({ className = 'size-7' }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const still = prefersReducedMotion()
    const eye = new AsciiEye(ctx, readColors(), monoFont())
    const inst: Instance = { eye, canvas, visible: false }

    const drawStill = () => {
      eye.wakeNow()
      eye.step(0, null, true, false)
      eye.draw()
    }
    const resize = () => {
      const w = canvas.getBoundingClientRect().width
      if (!w) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(w * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      eye.resize(w)
      if (still) drawStill()
    }
    resize()
    // шрифт символов догружается — пересчитать сетку под его ширину
    document.fonts?.load(`800 10px ${monoFont()}`).then(resize, () => {})

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    const io = new IntersectionObserver(([e]) => {
      inst.visible = e.isIntersecting
    })
    io.observe(canvas)
    // тема / палитра поменялись — перечитать цвета
    const mo = new MutationObserver(() => {
      eye.colors = readColors()
      if (still) eye.draw()
    })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette'] })
    const poke = () => eye.poke()
    canvas.addEventListener('pointerdown', poke)

    instances.add(inst)
    listen()
    start()
    return () => {
      instances.delete(inst)
      ro.disconnect()
      io.disconnect()
      mo.disconnect()
      canvas.removeEventListener('pointerdown', poke)
    }
  }, [])

  return <canvas ref={ref} aria-hidden className={`${className} bg-eye-tile ring-logo-tile-border block shrink-0 rounded-[22%] ring-1`} />
}
