/**
 * Оценка трейдера 0…100 (по мотивам Zella Score): шесть показателей, каждый переводится в 0…100 по шкале,
 * итог — взвешенная сумма. Шкалы и веса — здесь, в одном месте; тесты в score.test.ts.
 *
 *   показатель                         0 баллов    100 баллов   вес
 *   Profit factor                      ≤ 0,8       ≥ 2,5        25 %
 *   Средний выигрыш / средний проигрыш ≤ 0,5       ≥ 2,5        20 %
 *   Фактор восстановления (PnL / макс. просадка)  ≤ 0    ≥ 3    20 %
 *   Винрейт сделок                     ≤ 30 %      ≥ 65 %       15 %
 *   Винрейт дней                       ≤ 30 %      ≥ 70 %       10 %
 *   Стабильность (лучший день — малая доля всей прибыли)  доля ≥ 60 % → 0, ≤ 15 % → 100   10 %
 */
import type { DayPnl, Summary } from './stats'

export type ScoreKey = 'profitFactor' | 'winLoss' | 'recovery' | 'winrate' | 'dayWinrate' | 'consistency'

export type ScorePart = { key: ScoreKey; /** 0…100 */ score: number; /** исходное значение (для подписи), null — не посчитать */ value: number | null; weight: number }

export type TraderScore = { total: number; parts: ScorePart[]; dayWins: number; dayLosses: number; dayWinrate: number | null }

/** Сколько сделок нужно, чтобы оценка что-то значила (меньше — показываем подсказку) */
export const SCORE_MIN_TRADES = 10

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
/** линейная шкала: lo → 0, hi → 100 (hi может быть меньше lo — тогда «меньше — лучше») */
const scale = (v: number, lo: number, hi: number) => Math.round(clamp01((v - lo) / (hi - lo)) * 100)

export function traderScore(s: Summary, days: DayPnl[]): TraderScore {
  const dayWins = days.filter((d) => d.pnl > 0).length
  const dayLosses = days.filter((d) => d.pnl < 0).length
  const dayWinrate = dayWins + dayLosses > 0 ? dayWins / (dayWins + dayLosses) : null

  const pf = s.profitFactor
  const winLoss = s.avgWin !== null && s.avgLoss !== null && s.avgLoss < 0 ? s.avgWin / -s.avgLoss : s.avgWin !== null && s.losses === 0 ? Infinity : null
  const recovery = s.maxDrawdown > 0 ? s.totalPnl / s.maxDrawdown : s.totalPnl > 0 ? Infinity : s.closed > 0 ? 0 : null
  const profitDays = days.filter((d) => d.pnl > 0)
  const profitSum = profitDays.reduce((a, d) => a + d.pnl, 0)
  const bestShare = s.totalPnl > 0 && profitSum > 0 ? Math.max(...profitDays.map((d) => d.pnl)) / profitSum : null

  const part = (key: ScoreKey, value: number | null, weight: number, lo: number, hi: number): ScorePart => ({
    key,
    value,
    weight,
    score: value === null ? 0 : value === Infinity ? 100 : scale(value, lo, hi),
  })

  const parts: ScorePart[] = [
    part('profitFactor', pf, 25, 0.8, 2.5),
    part('winLoss', winLoss, 20, 0.5, 2.5),
    part('recovery', recovery, 20, 0, 3),
    part('winrate', s.winrate, 15, 0.3, 0.65),
    part('dayWinrate', dayWinrate, 10, 0.3, 0.7),
    // в минусе за период стабильности нет: 0 баллов
    { key: 'consistency', value: bestShare, weight: 10, score: bestShare === null ? 0 : scale(bestShare, 0.6, 0.15) },
  ]
  const total = Math.round(parts.reduce((a, p) => a + (p.score * p.weight) / 100, 0))
  return { total, parts, dayWins, dayLosses, dayWinrate }
}
