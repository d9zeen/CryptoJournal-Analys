import { describe, expect, it } from 'vitest'
import { DEMO_FEATURED, DEMO_TRADES, demoAccount, demoMistakeRows } from './demo'

describe('demoAccount', () => {
  it('одно и то же зерно — одни и те же сделки (главная выглядит одинаково)', () => {
    expect(demoAccount(0).summary).toEqual(demoAccount(0).summary)
  })

  it('пары и направления вперемешку, суммы не повторяются', () => {
    for (const seed of [1, 2, 3, 20261106]) {
      const tr = demoAccount(0, seed).trades
      expect(tr).toHaveLength(DEMO_TRADES)
      // не «лонг, шорт, лонг, шорт»: хотя бы где-то две одинаковые стороны подряд
      expect(tr.some((x, i) => i > 0 && x.side === tr[i - 1].side)).toBe(true)
      expect(new Set(tr.map((x) => x.symbol)).size).toBeGreaterThan(4)
      expect(new Set(tr.map((x) => x.pnl)).size).toBe(tr.length)
    }
  })

  it('другое зерно — другие сделки', () => {
    const a = demoAccount(0, 1).trades.map((x) => x.pnl)
    const b = demoAccount(0, 2).trades.map((x) => x.pnl)
    expect(a).not.toEqual(b)
  })

  it('0–4 сделки в день, бывают пустые дни и выходные, всего около двух месяцев', () => {
    const DAY = 86_400_000
    const now = Date.UTC(2026, 10, 11, 12)
    for (const seed of [1, 2, 3, 20261106]) {
      const { trades, days } = demoAccount(now, seed)
      expect(Math.max(...days.map((d) => d.count))).toBeLessThanOrEqual(4)
      expect(days.some((d) => d.count >= 2)).toBe(true)
      const first = Date.parse(days[0].date)
      const last = Date.parse(days[days.length - 1].date)
      const span = (last - first) / DAY + 1
      expect(span).toBeGreaterThan(days.length) // внутри есть дни без сделок
      expect(span).toBeGreaterThanOrEqual(40)
      expect(span).toBeLessThanOrEqual(75)
      expect(days.some((d) => [0, 6].includes(new Date(d.date).getUTCDay()))).toBe(true)
      // последний день со сделками — не в будущем
      expect(last).toBeLessThan(now)
      // сделки идут по времени
      expect(trades.every((x, i) => i === 0 || x.exit_at >= trades[i - 1].exit_at)).toBe(true)
    }
  })

  it('в середине — просадка, итог в плюс', () => {
    const a = demoAccount(0)
    expect(a.summary.totalPnl).toBeGreaterThan(0)
    expect(a.period).not.toBeNull()
  })

  it('сделка из «пути одной сделки» — та самая, с ошибкой «Вход без стопа»', () => {
    const a = demoAccount(0)
    const tr = a.trades.find((x) => x.id === a.featuredId)!
    expect([tr.symbol, tr.side, tr.pnl]).toEqual([DEMO_FEATURED.symbol, DEMO_FEATURED.side, DEMO_FEATURED.pnl])
    expect(tr.tagIds).toEqual([DEMO_FEATURED.mistake])
  })

  // «Путь одной сделки» на главной: карточка сделки, «Разбор» и календарь должны сходиться в любой день открытия
  it('«путь одной сделки»: день в календаре = сумма сделки, «Разбор» считает те же сделки', () => {
    const DAY = 86_400_000
    for (let k = 0; k < 40; k++) {
      const now = Date.UTC(2026, 0, 1, 12) + k * 9 * DAY
      const a = demoAccount(now)
      const tr = a.trades.find((x) => x.id === a.featuredId)!
      // сделка одна в своём дне: клетка календаря показывает ту же сумму
      const day = a.days.find((d) => d.date === tr.exit_at.slice(0, 10))!
      expect(day.count).toBe(1)
      expect(day.pnl).toBeCloseTo(DEMO_FEATURED.pnl, 2)
      // строки «Разбора» за месяц сделки = суммы сделок этого месяца с той же ошибкой
      const at = new Date(tr.exit_at)
      const rows = demoMistakeRows(a.trades, at.getUTCFullYear(), at.getUTCMonth())
      const own = rows.find((r) => r.key === DEMO_FEATURED.mistake)!
      expect(own.count).toBeGreaterThanOrEqual(1)
      const same = a.trades.filter((x) => x.tagIds.includes(DEMO_FEATURED.mistake) && x.exit_at.slice(0, 7) === tr.exit_at.slice(0, 7))
      expect(own.count).toBe(same.length)
      expect(own.pnl).toBeCloseTo(same.reduce((s, x) => s + x.pnl, 0), 2)
      for (const r of rows) expect(r.pnl).toBeLessThan(0)
    }
  })
})
