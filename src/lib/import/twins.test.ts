import { describe, expect, it } from 'vitest'
import { findTwins, twinRange } from './twins'

const t = (external_id: string, exit_at: string, pnl: number, symbol = 'LITUSDT', side = 'long') => ({ external_id, symbol, side, exit_at, pnl })

describe('двойники сделок (файл + API)', () => {
  it('та же сделка с другим номером: файл — до минуты, API — с секундами, PnL тот же', () => {
    const existing = [t('f:5jew9x1e6d2yn', '2026-09-12T19:46:00Z', -2244.15963316)]
    expect(findTwins([t('o:f81b2944', '2026-09-12T19:46:57.377Z', -2244.15963316)], existing)).toEqual(new Set(['o:f81b2944']))
  })
  it('другая пара, сторона, время или PnL — не двойник', () => {
    const existing = [t('f:1', '2026-09-12T19:46:00Z', -100)]
    expect(findTwins([t('o:a', '2026-09-12T19:46:30Z', -100, 'ETHUSDT')], existing).size).toBe(0)
    expect(findTwins([t('o:b', '2026-09-12T19:46:30Z', -100, 'LITUSDT', 'short')], existing).size).toBe(0)
    expect(findTwins([t('o:c', '2026-09-12T19:55:00Z', -100)], existing).size).toBe(0)
    expect(findTwins([t('o:d', '2026-09-12T19:46:30Z', -90)], existing).size).toBe(0)
  })
  it('одна записанная сделка гасит только одну новую; тот же номер — это обычный дубль, не двойник', () => {
    const existing = [t('f:1', '2026-09-12T19:46:00Z', 50)]
    expect(findTwins([t('o:a', '2026-09-12T19:46:10Z', 50), t('o:b', '2026-09-12T19:46:20Z', 50)], existing)).toEqual(new Set(['o:a']))
    expect(findTwins([t('f:1', '2026-09-12T19:46:00Z', 50)], existing).size).toBe(0)
  })
  it('окно поиска — от первой до последней сделки ± 3 минуты', () => {
    expect(twinRange([t('a', '2026-09-12T10:00:00Z', 1), t('b', '2026-09-10T10:00:00Z', 1)])).toEqual({ from: '2026-09-10T09:57:00.000Z', to: '2026-09-12T10:03:00.000Z' })
    expect(twinRange([])).toBeNull()
  })
})
