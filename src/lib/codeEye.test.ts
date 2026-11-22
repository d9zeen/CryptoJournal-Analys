import { describe, expect, it } from 'vitest'
import { CodeEye, type CodeEyeColors } from './codeEye'

/** Холст-заглушка: считает символы, остальное — пустые функции */
function fakeCtx() {
  const calls = { text: 0 }
  const noop = () => {}
  const gradient = { addColorStop: noop }
  return new Proxy(
    { calls },
    {
      get(target, key) {
        if (key === 'calls') return target.calls
        if (key === 'measureText') return () => ({ width: 8.4 })
        if (key === 'fillText') return () => calls.text++
        if (key === 'createRadialGradient' || key === 'createLinearGradient') return () => gradient
        return noop
      },
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D & { calls: { text: number } }
}

const C: CodeEyeColors = {
  sclera: [236, 235, 246],
  irisCore: [236, 230, 255],
  iris: [152, 128, 255],
  irisEdge: [58, 38, 150],
  pupil: [6, 6, 8],
  glint: [255, 255, 255],
  line: [196, 192, 214],
  code: [90, 88, 110],
  ink: [44, 42, 58],
}

describe('codeEye', () => {
  it('зрачок смотрит в сторону цели и не уходит за радужку', () => {
    const eye = new CodeEye(fakeCtx(), C, 'monospace')
    for (let i = 0; i < 120; i++) eye.step(1 / 60, { x: 30, y: 0 }, true, false)
    expect(eye.s.gx).toBeGreaterThan(0.15)
    expect(eye.s.gx).toBeLessThan(0.4)
    const uv = eye.pupilUv()
    expect(uv.u).toBeGreaterThan(0.5)
    expect(uv.v).toBeGreaterThan(0.3)
    expect(uv.v).toBeLessThan(0.7)
  })

  it('засыпает без движения и открывается снова', () => {
    const eye = new CodeEye(fakeCtx(), C, 'monospace')
    for (let i = 0; i < 150; i++) eye.step(1 / 30, null, false, false)
    expect(eye.s.wake).toBeLessThan(0.05)
    for (let i = 0; i < 30; i++) eye.step(1 / 30, null, true, false)
    expect(eye.s.wake).toBeGreaterThan(0.95)
  })

  it('новая свеча: старые плавно съезжают, лишняя уходит только после съезда', () => {
    const eye = new CodeEye(fakeCtx(), C, 'monospace')
    expect(eye.candleCount).toBe(7)
    eye.addCandle(true)
    expect(eye.candleCount).toBe(8) // пока съезжают — и уходящая на месте
    eye.step(0.2, null, true, false)
    expect(eye.candleCount).toBe(8)
    eye.step(0.5, null, true, false)
    expect(eye.candleCount).toBe(7)
  })

  it('рисует строки кода и с открытым, и с закрытым глазом (вместо белка — облако кода)', () => {
    const ctx = fakeCtx()
    const eye = new CodeEye(ctx, C, 'monospace')
    eye.step(0, null, true, false)
    eye.draw()
    const open = ctx.calls.text
    expect(open).toBeGreaterThan(500)
    for (let i = 0; i < 150; i++) eye.step(1 / 30, null, false, false)
    ctx.calls.text = 0
    eye.draw()
    expect(ctx.calls.text).toBeGreaterThan(500)
  })
})
