import { describe, expect, it } from 'vitest'
import { AsciiEye, parseHex, type EyeColors } from './asciiEye'

/** Холст-заглушка: считает нарисованные символы, остальное — пустые функции */
function fakeCtx() {
  const calls = { text: 0 }
  const noop = () => {}
  const gradient = { addColorStop: noop }
  const ctx = new Proxy(
    { calls },
    {
      get(target, key) {
        if (key === 'calls') return target.calls
        if (key === 'measureText') return () => ({ width: 1.6 })
        if (key === 'fillText') return () => calls.text++
        if (key === 'createRadialGradient') return () => gradient
        return noop
      },
      set: () => true,
    },
  )
  return ctx as unknown as CanvasRenderingContext2D & { calls: { text: number } }
}

const C: EyeColors = {
  sclera: [236, 235, 246],
  irisCore: [236, 230, 255],
  iris: [152, 128, 255],
  irisEdge: [58, 38, 150],
  lid: [196, 192, 214],
  pupil: [6, 6, 8],
  glow: [141, 120, 255],
  glint: [255, 255, 255],
  tile: [20, 20, 24],
}

/** Положение зрачка — из приватного состояния (только для теста) */
const state = (eye: AsciiEye) => (eye as unknown as { s: { gx: number; gy: number; wake: number } }).s

describe('asciiEye', () => {
  it('parseHex: #rrggbb и #rgb, остальное — null', () => {
    expect(parseHex('#8d78ff')).toEqual([141, 120, 255])
    expect(parseHex(' #FFF ')).toEqual([255, 255, 255])
    expect(parseHex('rgb(1, 2, 3)')).toBeNull()
    expect(parseHex('')).toBeNull()
  })

  it('зрачок смотрит в сторону курсора и не уходит за край радужки', () => {
    const eye = new AsciiEye(fakeCtx(), C, 'monospace')
    eye.resize(28)
    for (let i = 0; i < 120; i++) eye.step(1 / 60, { dx: 40, dy: 0 }, true, false)
    const right = state(eye).gx
    expect(right).toBeGreaterThan(0.15)
    expect(right).toBeLessThan(0.4)
    for (let i = 0; i < 120; i++) eye.step(1 / 60, { dx: 0, dy: -40 }, true, false)
    expect(state(eye).gy).toBeLessThan(-0.05)
    expect(Math.abs(state(eye).gx)).toBeLessThan(0.05)
  })

  it('засыпает без мыши и просыпается от движения', () => {
    const eye = new AsciiEye(fakeCtx(), C, 'monospace')
    eye.resize(28)
    for (let i = 0; i < 60; i++) eye.step(1 / 30, null, true, false)
    expect(state(eye).wake).toBeGreaterThan(0.95)
    for (let i = 0; i < 150; i++) eye.step(1 / 30, null, false, false)
    expect(state(eye).wake).toBeLessThan(0.05)
    for (let i = 0; i < 30; i++) eye.step(1 / 30, { dx: 1, dy: 1 }, true, false)
    expect(state(eye).wake).toBeGreaterThan(0.95)
  })

  it('рисует символы; закрытый глаз — только веко (меньше символов)', () => {
    const ctx = fakeCtx()
    const eye = new AsciiEye(ctx, C, 'monospace')
    eye.resize(56)
    eye.wakeNow()
    eye.step(0, null, true, false)
    eye.draw()
    const open = ctx.calls.text
    expect(open).toBeGreaterThan(40)
    for (let i = 0; i < 150; i++) eye.step(1 / 30, null, false, false)
    ctx.calls.text = 0
    eye.draw()
    expect(ctx.calls.text).toBeGreaterThan(0)
    expect(ctx.calls.text).toBeLessThan(open / 2)
  })
})
