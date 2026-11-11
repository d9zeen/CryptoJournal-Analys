import { describe, expect, it } from 'vitest'
import { compactPnl, monthSummary, monthWeeks, profitCalendar } from './calendar'

describe('profitCalendar', () => {
  // сентябрь 2026: 1-е — вторник, сетка с понедельника 31 августа
  const trades = [
    { exit_at: '2026-09-01T10:00:00Z', pnl: -226.36 },
    { exit_at: '2026-09-02T10:00:00Z', pnl: 200 },
    { exit_at: '2026-09-02T12:00:00Z', pnl: -62.8 },
    { exit_at: '2026-10-01T10:00:00Z', pnl: 1142.37 }, // соседний месяц, та же неделя, что 28–30 сентября
    { exit_at: '2026-09-30T22:30:00Z', pnl: 50 }, // в Москве это уже 1 октября
  ]
  const cal = profitCalendar(trades, 2026, 8, 'Europe/Moscow')

  it('сетка с понедельника только из недель этого месяца, дни соседних месяцев помечены', () => {
    expect(cal.weeks).toHaveLength(5) // 31.08–06.09 … 28.09–04.10; неделя 5–11 октября не нужна
    expect(cal.weeks[0].days[0]).toMatchObject({ date: '2026-08-31', day: 31, inMonth: false })
    expect(cal.weeks[0].days[1]).toMatchObject({ date: '2026-09-01', inMonth: true, pnl: -226.36, count: 1, wins: 0 })
  })

  it('день: PnL, сделки, выигрышные', () => {
    expect(cal.weeks[0].days[2]).toMatchObject({ date: '2026-09-02', count: 2, wins: 1 })
    expect(cal.weeks[0].days[2].pnl).toBeCloseTo(137.2)
  })

  it('день — по дате закрытия в поясе пользователя', () => {
    const oct1 = cal.weeks[4].days.find((d) => d.date === '2026-10-01')!
    expect(oct1).toMatchObject({ inMonth: false, count: 2 })
  })

  it('итоги недели и месяца — только свои дни', () => {
    expect(cal.weeks[4].total.count).toBe(0) // 1 октября — чужой месяц
    expect(cal.month.count).toBe(3)
    expect(cal.month.pnl).toBeCloseTo(-226.36 + 137.2)
    expect(cal.month.wins).toBe(1)
  })

  it('лучшая и худшая сделка месяца — только свои дни', () => {
    expect(cal.month.best).toBe(200)
    expect(cal.month.worst).toBe(-226.36)
    const empty = profitCalendar([], 2026, 8, 'UTC')
    expect(empty.month).toMatchObject({ best: null, worst: null, count: 0 })
  })

  it('рядов столько, сколько недель у месяца: 4, 5 или 6', () => {
    const nov = profitCalendar([], 2026, 10, 'UTC')
    expect(nov.weeks).toHaveLength(6)
    expect(profitCalendar([], 2026, 1, 'UTC').weeks).toHaveLength(5) // февраль 2026: 1-е — воскресенье
    expect(profitCalendar([], 2021, 1, 'UTC').weeks).toHaveLength(4) // февраль 2021: с понедельника, ровно 4 недели
  })
})

describe('compactPnl', () => {
  it('по-русски для узких клеток: целые до 1000, «к» и «м» с запятой, минус «−»', () => {
    expect(compactPnl(92.2)).toBe('+92')
    expect(compactPnl(-94.9)).toBe('−95')
    expect(compactPnl(137.2)).toBe('+137')
    expect(compactPnl(1652.68)).toBe('+1,7к')
    expect(compactPnl(-2236.3)).toBe('−2,2к')
    expect(compactPnl(2000)).toBe('+2к')
    expect(compactPnl(999.6)).toBe('+1к')
    expect(compactPnl(1_234_567)).toBe('+1,2м')
    expect(compactPnl(-999_990)).toBe('−1м')
    expect(compactPnl(0)).toBe('0')
    expect(compactPnl(0.3)).toBe('0')
  })
})

describe('monthSummary', () => {
  // сентябрь 2026 (1-е — вторник): 1-е −100, 2-е +300 (две сделки), 8-е −50; 1 октября — чужой месяц, не считается
  const cal = profitCalendar(
    [
      { exit_at: '2026-09-01T10:00:00Z', pnl: -100 },
      { exit_at: '2026-09-02T10:00:00Z', pnl: 200 },
      { exit_at: '2026-09-02T12:00:00Z', pnl: 100 },
      { exit_at: '2026-09-08T10:00:00Z', pnl: -50 },
      { exit_at: '2026-10-01T10:00:00Z', pnl: 999 },
    ],
    2026,
    8,
    'UTC',
  )
  const s = monthSummary(cal)

  it('дни в плюс / минус, лучший и худший день, средний за день', () => {
    expect(s).toMatchObject({ tradedDays: 3, upDays: 1, downDays: 2, maxAbsDay: 300 })
    expect(s.best).toMatchObject({ date: '2026-09-02', pnl: 300 })
    expect(s.worst).toMatchObject({ date: '2026-09-01', pnl: -100 })
    expect(s.avgDay).toBeCloseTo(50) // 150 / 3
  })

  it('недели и дни недели — только дни этого месяца', () => {
    expect(s.weeks[0]).toMatchObject({ pnl: 200, count: 3 }) // 1–2 сентября; 31 августа не считается
    expect(s.weeks[1]).toMatchObject({ pnl: -50, count: 1 })
    expect(s.weeks[4]).toMatchObject({ pnl: 0, count: 0 }) // 28–30 сентября без сделок; 1 октября — чужой
    expect(s.weekdays[1]).toMatchObject({ pnl: -150, count: 2 }) // вторники: 1 и 8 сентября
    expect(s.weekdays[2]).toMatchObject({ pnl: 300 })
  })

  it('пустой месяц — без лучшего / худшего и среднего', () => {
    const e = monthSummary(profitCalendar([], 2026, 8, 'UTC'))
    expect(e).toMatchObject({ tradedDays: 0, best: null, worst: null, avgDay: null, maxAbsDay: 0 })
  })
})

describe('monthWeeks', () => {
  // ноябрь 2026: 1-е — воскресенье, 30-е — понедельник → 6 рядов, крайние из одного дня
  const nov = profitCalendar([{ exit_at: '2026-11-01T12:00:00Z', pnl: 10 }, { exit_at: '2026-11-30T12:00:00Z', pnl: -5 }], 2026, 10, 'UTC')
  const span = (rows: { from: number; to: number }[]) => rows.map((r) => `${r.from}–${r.to}`)

  it('rows — как ряды календаря', () => {
    expect(span(monthWeeks(nov, 'rows'))).toEqual(['1–1', '2–8', '9–15', '16–22', '23–29', '30–30'])
  })

  it('merge — огрызки короче 4 дней приклеены к соседней неделе', () => {
    const rows = monthWeeks(nov, 'merge')
    expect(span(rows)).toEqual(['1–8', '9–15', '16–22', '23–30'])
    expect(rows[0].cell.pnl).toBe(10)
    expect(rows[3].cell.pnl).toBe(-5)
  })

  it('days — по числам месяца', () => {
    expect(span(monthWeeks(nov, 'days'))).toEqual(['1–7', '8–14', '15–21', '22–28', '29–30'])
    expect(span(monthWeeks(profitCalendar([], 2021, 1, 'UTC'), 'days'))).toEqual(['1–7', '8–14', '15–21', '22–28'])
  })
})
