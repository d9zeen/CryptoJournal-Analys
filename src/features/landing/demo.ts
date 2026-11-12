/**
 * Демо-счёт для главной страницы: 60 выдуманных сделок примерно за два месяца, 0–4 в день (детерминированно — одинаково при каждом открытии).
 * Считается теми же функциями, что и настоящий дашборд.
 */
import { closedTrades, downsampleEquity, drawdownPeriod, equityCurve, pnlBars, pnlByDay, rWinLoss, summarize, type ClosedTrade, type StatTrade } from '@/lib/calc/stats'
import { traderScore } from '@/lib/calc/score'

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'TONUSDT', 'XRPUSDT', 'DOGEUSDT', 'BNBUSDT', 'SUIUSDT', 'LINKUSDT', 'AVAXUSDT']
/** Сколько сделок в демо-счёте */
export const DEMO_TRADES = 60

/** Простой генератор случайных чисел с зерном (mulberry32): одни и те же «случайные» сделки при каждом открытии */
function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const DAY = 86_400_000

/** Теги ошибок демо-счёта (подписи — landing.path.analysis.rows в ru.ts) */
export const DEMO_MISTAKES = ['late', 'nostop', 'hold'] as const
export type DemoMistake = (typeof DEMO_MISTAKES)[number]

/**
 * Сделка из «пути одной сделки» на главной: ETHUSDT Short −61,20 $, ошибка «Вход без стопа».
 * Стоит в середине просадки и одна в своём дне — клетка календаря показывает ту же сумму, что и карточка сделки.
 */
export const DEMO_FEATURED = { symbol: 'ETHUSDT', side: 'short' as const, pnl: -61.2, mistake: 'nostop' as DemoMistake }

/** Какой по счёту будет сделка из «пути»: в просадке (24…33), одна в своём дне, ближе всего к 28-й */
function featuredIndex(dayOf: number[], perDay: number[]): number {
  const alone = dayOf.map((d, i) => (perDay[d] === 1 ? i : -1)).filter((i) => i >= 0)
  const inSlump = alone.filter((i) => i >= 24 && i <= 33)
  const pool = inSlump.length ? inSlump : alone
  if (!pool.length) return 27
  return pool.reduce((best, i) => (Math.abs(i - 28) < Math.abs(best - 28) ? i : best))
}

/** Строки «Разбора» по ошибкам за месяц (UTC): сколько сделок и сколько они стоили — из тех же демо-сделок, что и календарь */
export function demoMistakeRows(trades: ClosedTrade[], year: number, month: number) {
  const inMonth = trades.filter((x) => {
    const d = new Date(x.exit_at)
    return d.getUTCFullYear() === year && d.getUTCMonth() === month
  })
  return DEMO_MISTAKES.map((key) => {
    const hit = inMonth.filter((x) => x.tagIds.includes(key))
    return { key, count: hit.length, pnl: Math.round(hit.reduce((s, x) => s + x.pnl, 0) * 100) / 100 }
  }).filter((r) => r.count > 0)
}

/**
 * Неделя (пн–вс, UTC) со сделкой из «пути» — шаг 3 на главной: суммы и число сделок по дням, итог недели
 * и сама сделка (день, сумма, ошибка) для подписи под неделей. Всё из тех же демо-сделок, что «Разбор» рядом.
 */
export function demoWeek(trades: ClosedTrade[], featuredId: string) {
  const tr = trades.find((x) => x.id === featuredId) ?? trades[trades.length - 1]
  const day0 = Date.parse(`${tr.exit_at.slice(0, 10)}T00:00:00Z`)
  const monday = day0 - ((new Date(day0).getUTCDay() + 6) % 7) * DAY
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday + i * DAY).toISOString().slice(0, 10)
    const hit = trades.filter((x) => x.exit_at.slice(0, 10) === date)
    return { date, day: Number(date.slice(8)), count: hit.length, pnl: Math.round(hit.reduce((s, x) => s + x.pnl, 0) * 100) / 100 }
  })
  const total = { count: days.reduce((s, d) => s + d.count, 0), pnl: Math.round(days.reduce((s, d) => s + d.pnl, 0) * 100) / 100 }
  const date = tr.exit_at.slice(0, 10)
  const own = days.find((d) => d.date === date)!
  return { days, total, featured: { date, pnl: own.pnl, count: own.count, mistake: (tr.tagIds[0] ?? DEMO_FEATURED.mistake) as DemoMistake } }
}

/**
 * Сделки «живого примера» на первом входе (Welcome): тот же демо-счёт, но в порядке, в котором новичку не страшно —
 * первые сделки в плюс, счёт по пути не уходит в минус, убыточные разбросаны по всей ленте, итог около +2 400 $ при винрейте ~55 %.
 * Даты и время остаются по порядку (берутся у исходных сделок), меняется только какая сделка за какой идёт.
 */
export function welcomeTrades(seed: number, now = Date.now()): ClosedTrade[] {
  let base: ClosedTrade[] = []
  for (let s = seed; s < seed + 500; s++) {
    base = demoAccount(now, s).trades
    const total = base.reduce((a, x) => a + x.pnl, 0)
    const wr = base.filter((x) => x.pnl > 0).length / base.length
    if (total >= 2100 && total <= 2700 && wr >= 0.52 && wr <= 0.6) break
  }
  const wins = base.filter((x) => x.pnl > 0)
  const losses = base.filter((x) => x.pnl <= 0)
  const out: ClosedTrade[] = []
  let cum = 0
  let wi = 0
  let li = 0
  while (out.length < base.length) {
    const left = wi >= wins.length
    // убыточная — когда их «доля» отстала от пройденного пути и счёт после неё останется в плюсе; первые три (видны сразу) — всегда прибыльные
    const lossDue = li < losses.length && out.length >= 3 && li / losses.length <= out.length / base.length && cum + losses[li].pnl > 0
    const next = left || lossDue ? losses[li++] : wins[wi++]
    cum += next.pnl
    out.push(next)
  }
  return out.map((x, i) => ({ ...x, entry_at: base[i].entry_at, exit_at: base[i].exit_at }))
}

/** Сколько сделок в день: 0…4, чаще 0–1 (в среднем ≈ 1 в день — 60 сделок примерно за два месяца) */
function dayCount(r: number): number {
  return r < 0.4 ? 0 : r < 0.68 ? 1 : r < 0.86 ? 2 : r < 0.95 ? 3 : 4
}

/** seed — другое зерно = другие сделки (стартовый экран берёт новое на каждый круг примера) */
export function demoAccount(now = Date.now(), seed = 20261106) {
  const rnd = seeded(seed)
  // пара и направление — отдельным генератором, чтобы суммы сделок от них не зависели
  const pick = seeded(seed ^ 0x5bd1e995)
  // дни и часы — третьим генератором: 0–4 сделки в день, выходные тоже, бывают пустые дни
  const cal = seeded(seed ^ 0x27d4eb2f)
  const perDay: number[] = []
  for (let n = 0; n < DEMO_TRADES; ) {
    const c = Math.min(dayCount(cal()), DEMO_TRADES - n)
    perDay.push(c)
    n += c
  }
  // последний день со сделками — вчера (по UTC)
  const start = (Math.floor(now / DAY) - perDay.length) * DAY
  const times: number[] = []
  const dayOf: number[] = []
  perDay.forEach((c, d) => {
    const hours = Array.from({ length: c }, () => 8 + cal() * 14).sort((a, b) => a - b)
    for (const h of hours) {
      times.push(start + d * DAY + Math.round(h * 60) * 60_000)
      dayOf.push(d)
    }
  })
  const featured = featuredIndex(dayOf, perDay)
  // ошибки: у убыточных сделок по кругу — примерно поровну каждой, у части ошибки нет; начало круга — от зерна
  const ROUND: (DemoMistake | null)[] = ['late', 'hold', 'nostop', null, 'hold', 'late', null, 'nostop']
  let loser = Math.floor(seeded(seed ^ 0x165667b1)() * ROUND.length)
  const used = new Set<number>([DEMO_FEATURED.pnl])
  const trades: StatTrade[] = Array.from({ length: DEMO_TRADES }, (_, i) => {
    // как у живого трейдера: ~58 % сделок в плюс, прибыль крупнее убытка, в середине — серия неудач (просадка)
    const slump = i >= 24 && i <= 33
    const win = rnd() < (slump ? 0.25 : 0.62)
    const size = win ? 40 + rnd() * 230 : 30 + rnd() * (slump ? 190 : 120)
    let pnl = Math.round((win ? size : -size) * 100) / 100
    // одинаковых сумм не бывает: совпала — сдвигаем на несколько центов
    while (used.has(pnl)) pnl = Math.round((pnl + (win ? 0.07 : -0.07)) * 100) / 100
    used.add(pnl)
    let side: 'long' | 'short' = pick() < 0.55 ? 'long' : 'short'
    let symbol = SYMBOLS[Math.floor(pick() * SYMBOLS.length)]
    if (i === featured) ({ symbol, side, pnl } = DEMO_FEATURED)
    const mistake: DemoMistake | null = i === featured ? DEMO_FEATURED.mistake : pnl >= 0 ? null : ROUND[loser++ % ROUND.length]
    const exit = times[i]
    const hold = (20 + Math.floor(rnd() * 220)) * 60_000 // держал от 20 минут до 4 часов
    return {
      id: `demo-${i}`,
      side,
      symbol,
      entry_at: new Date(exit - hold).toISOString(),
      exit_at: new Date(exit).toISOString(),
      pnl,
      r_multiple: Math.round((pnl / 90) * 100) / 100,
      setup_id: null,
      emotion_id: null,
      tagIds: mistake ? [mistake] : [],
    }
  })
  const closed = closedTrades(trades)
  const curve = equityCurve(closed)
  const summary = summarize(closed, 5000)
  const days = pnlByDay(closed, 'UTC')
  return {
    summary,
    curve,
    equity: downsampleEquity(curve),
    score: traderScore(summary, days),
    balance: 5000,
    period: drawdownPeriod(curve),
    rwl: rWinLoss(closed),
    bars: pnlBars(days),
    trades: closed,
    days,
    /** id сделки из «пути одной сделки» */
    featuredId: `demo-${featured}`,
  }
}
