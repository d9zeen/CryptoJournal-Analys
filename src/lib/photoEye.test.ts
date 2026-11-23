import { describe, expect, it } from 'vitest'
import { PHOTO_EYE_CHANGE_S, PhotoEye, type PhotoEyeColors } from './photoEye'

/** Холст-заглушка: пишет нарисованные символы, остальное — пустые функции */
function fakeCtx() {
  const calls = { text: 0 }
  const noop = () => {}
  const gradient = { addColorStop: noop }
  return new Proxy(
    { calls },
    {
      get(target, key) {
        if (key === 'calls') return target.calls
        if (key === 'measureText') return () => ({ width: 2.6 })
        if (key === 'fillText') return () => calls.text++
        if (key === 'createRadialGradient') return () => gradient
        return noop
      },
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D & { calls: { text: number } }
}

const C: PhotoEyeColors = {
  bg: [12, 13, 16],
  core: [255, 222, 140],
  iris: [244, 128, 36],
  edge: [120, 34, 14],
  skin: [220, 206, 190],
  sclera: [246, 240, 230],
  dim: [70, 60, 52],
  glow: [255, 140, 40],
  pupil: [6, 6, 8],
}

/** Все символы плитки при одинаковой яркости — чтобы видеть только медленную смену */
function snapshot(eye: PhotoEye) {
  const { cols, rows } = eye.size
  const out: string[] = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push(eye.glyph(c, r, 0.6))
  return out
}

describe('photoEye', () => {
  it('символ — по яркости: тёмное тонкое, светлое плотное, совсем тёмное — пусто', () => {
    const eye = new PhotoEye(fakeCtx(), C, 'monospace')
    eye.resize(156, 108)
    expect(eye.glyph(3, 3, 0)).toBe(' ')
    expect(' .:;ij').toContain(eye.glyph(3, 3, 0.08))
    expect('%B@$8&W').toContain(eye.glyph(3, 3, 1))
  })

  it('символы меняются медленно: за 0,1 с — почти никто, за ~3 смены — почти все', () => {
    const eye = new PhotoEye(fakeCtx(), C, 'monospace')
    eye.resize(156, 108)
    const a = snapshot(eye)
    eye.step(0.1, null)
    const b = snapshot(eye)
    const changedFast = a.filter((g, i) => g !== b[i]).length / a.length
    expect(changedFast).toBeLessThan(0.05)
    for (let i = 0; i < 30; i++) eye.step((PHOTO_EYE_CHANGE_S * 3) / 30, null)
    const c = snapshot(eye)
    const changedSlow = a.filter((g, i) => g !== c[i]).length / a.length
    expect(changedSlow).toBeGreaterThan(0.4)
  })

  it('зрачок смотрит на цель и не выходит за радужку; сделка — зрачок расширяется', () => {
    const eye = new PhotoEye(fakeCtx(), C, 'monospace')
    eye.resize(156, 108)
    for (let i = 0; i < 120; i++) eye.step(1 / 60, { x: 30, y: 0 })
    expect(eye.s.gx).toBeGreaterThan(0.15)
    expect(eye.s.gx).toBeLessThan(0.4)
    const before = eye.s.pupil
    eye.dilate()
    for (let i = 0; i < 20; i++) eye.step(1 / 60, { x: 30, y: 0 })
    expect(eye.s.pupil).toBeGreaterThan(before)
  })

  it('рисует плитку символами целиком (кожа, белок, радужка)', () => {
    const ctx = fakeCtx()
    const eye = new PhotoEye(ctx, C, 'monospace')
    eye.resize(156, 108)
    eye.step(0, null)
    eye.draw()
    const { cols, rows } = eye.size
    expect(ctx.calls.text).toBeGreaterThan(cols * rows * 0.5)
  })
})
