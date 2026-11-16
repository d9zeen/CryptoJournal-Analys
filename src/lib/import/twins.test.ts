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
  it('окно поиска — с самого раннего закрытия / открытия; вперёд — с запасом на длинную позицию', () => {
    const r = twinRange([t('a', '2026-09-12T10:00:00Z', 1), { ...t('b', '2026-09-10T10:00:00Z', 1), entry_at: '2026-09-08T10:00:00Z' }])!
    expect(r.from).toBe('2026-09-08T09:57:00.000Z')
    expect(Date.parse(r.to)).toBe(Date.parse('2026-09-12T10:03:00Z') + 90 * 86_400_000)
    expect(twinRange([])).toBeNull()
  })

  // настоящие данные владельца (16.11.2026): файл — позиция одной строкой, API — каждое частичное закрытие отдельно
  const whole = (id: string, open: string, exit: string, pnl: number, symbol = 'JUPUSDT') => ({ ...t(id, exit, pnl, symbol), entry_at: open })
  const piece = (id: string, exit: string, pnl: number, symbol = 'JUPUSDT') => ({ ...t(id, exit, pnl, symbol), entry_at: exit })
  it('куски по API к целой из файла: JUP +310,94 и +817,55 = +1 128,49', () => {
    const file = [whole('f:jup', '2026-09-29T08:00:00Z', '2026-10-01T10:06:00Z', 1128.49)]
    const api = [piece('o:1', '2026-09-30T19:53:00Z', 310.94), piece('o:2', '2026-10-01T10:06:04Z', 817.55)]
    expect(findTwins(api, file)).toEqual(new Set(['o:1', 'o:2']))
  })
  it('целая из файла к записанным кускам по API (обратный порядок): NEAR — три куска за два дня', () => {
    const api = [piece('o:a', '2026-10-15T15:06:34Z', 63.87, 'NEARUSDT'), piece('o:b', '2026-10-15T17:21:56Z', 284.16, 'NEARUSDT'), piece('o:c', '2026-10-17T16:53:26Z', -3.98, 'NEARUSDT')]
    const file = [whole('f:near', '2026-10-14T09:00:00Z', '2026-10-17T16:53:00Z', 344.05, 'NEARUSDT')]
    expect(findTwins(file, api)).toEqual(new Set(['f:near']))
  })
  it('сумма не сходится или последний кусок закрылся не вместе с целой — это разные сделки', () => {
    const file = [whole('f:x', '2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z', 100)]
    expect(findTwins([piece('o:1', '2026-10-01T10:00:00Z', 40), piece('o:2', '2026-10-02T00:00:30Z', 50)], file).size).toBe(0)
    expect(findTwins([piece('o:1', '2026-10-01T10:00:00Z', 40), piece('o:2', '2026-10-01T20:00:00Z', 60)], file).size).toBe(0)
  })
})
