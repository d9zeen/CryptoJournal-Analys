/**
 * Сравнение показателей верхнего ряда «Статистики» с прошлым периодом той же длины (неделя → прошлая неделя,
 * месяц → прошлый календарный месяц, свой диапазон → такой же отрезок прямо перед ним; «всё время» — без сравнения).
 * Формат — по смыслу, без «процентов от минуса»:
 *  - PnL — разница в $ («▲ +312 $ к октябрю»);
 *  - винрейты — разница в процентных пунктах («▼ −4 п.п.»);
 *  - profit factor и «Выигрыш / проигрыш» — прежнее значение («▲ было 1,74»).
 * dir: up — стало лучше, down — хуже, same — так же. Нет сделок в прошлом периоде — сравнения нет (null).
 */
import type { Summary } from './stats'

export type KpiSnapshot = {
  /** закрытых сделок за период */
  count: number
  pnl: number
  /** 0…1 */
  winrate: number | null
  profitFactor: number | null
  /** 0…1 */
  dayWinrate: number | null
  /** средний выигрыш / |средний проигрыш| */
  winLoss: number | null
}

export type Dir = 'up' | 'down' | 'same'
export type Delta = { kind: 'usd'; delta: number; dir: Dir } | { kind: 'pp'; delta: number; dir: Dir } | { kind: 'was'; prev: number; dir: Dir }
export type KpiDeltas = { pnl: Delta | null; winrate: Delta | null; profitFactor: Delta | null; dayWinrate: Delta | null; winLoss: Delta | null }

export function kpiSnapshot(s: Summary, dayWinrate: number | null): KpiSnapshot {
  return {
    count: s.closed,
    pnl: s.totalPnl,
    winrate: s.winrate,
    profitFactor: s.profitFactor,
    dayWinrate,
    winLoss: s.avgWin !== null && s.avgLoss !== null && s.avgLoss < 0 ? s.avgWin / -s.avgLoss : null,
  }
}

const dirOf = (d: number): Dir => (d > 0 ? 'up' : d < 0 ? 'down' : 'same')
const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits

/** Разница в процентных пунктах, до 0,1 п.п. */
function pp(cur: number | null, prev: number | null): Delta | null {
  if (cur === null || prev === null) return null
  const delta = round((cur - prev) * 100, 1)
  return { kind: 'pp', delta, dir: dirOf(delta) }
}

/** «было X»: сравнение отношений (Infinity — убытков не было — больше любого числа) */
function was(cur: number | null, prev: number | null): Delta | null {
  if (cur === null || prev === null || Number.isNaN(cur) || Number.isNaN(prev)) return null
  const dir: Dir = cur === prev ? 'same' : cur > prev ? 'up' : 'down'
  return { kind: 'was', prev, dir }
}

/** Сравнить текущий период с прошлым; прошлого нет или в нём ни одной сделки — null (ничего не показываем) */
export function compareKpis(cur: KpiSnapshot, prev: KpiSnapshot | null): KpiDeltas | null {
  if (!prev || prev.count === 0) return null
  const delta = round(cur.pnl - prev.pnl, 2)
  return {
    pnl: { kind: 'usd', delta, dir: dirOf(delta) },
    winrate: pp(cur.winrate, prev.winrate),
    profitFactor: was(cur.profitFactor, prev.profitFactor),
    dayWinrate: pp(cur.dayWinrate, prev.dayWinrate),
    winLoss: was(cur.winLoss, prev.winLoss),
  }
}
