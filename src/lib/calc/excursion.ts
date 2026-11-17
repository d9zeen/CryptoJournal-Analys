/**
 * MAE / MFE и «эффективность выхода» по свечам (17.11.2026, план — п. 6).
 *
 * MFE (лучшая точка) — насколько далеко цена ушла В ТВОЮ сторону, пока сделка была открыта;
 * MAE (худшая точка) — насколько далеко ПРОТИВ тебя.
 *   long:  MFE = max(high) − вход, MAE = вход − min(low);
 *   short: MFE = вход − min(low),  MAE = max(high) − вход.
 * Берутся свечи, которые пересекаются со временем сделки (точность — до одной свечи: в свече входа может быть цена чуть раньше входа).
 * Цены входа и выхода тоже входят в экстремумы — даже если свечи другой биржи, MFE не меньше результата, а MAE не меньше убытка.
 * В долларах — × количество монет (размер / цена входа), в R — / (|вход − стоп|), если стоп указан.
 * Эффективность выхода = взятое движение / MFE (1 = вышел на самом лучшем месте; меньше нуля — закрыл в минус).
 */
import type { Side } from './trade'

export type ExcursionCandle = { t: number; h: number; l: number }
export type Excursion = {
  mfe: number
  mae: number
  mfePct: number
  maePct: number
  mfeUsd: number | null
  maeUsd: number | null
  mfeR: number | null
  maeR: number | null
  /** взятое / лучшее (null — сделка открыта или цена ни разу не ушла в плюс) */
  efficiency: number | null
  /** время свечей, где была лучшая и худшая точка (для отметок на графике) */
  mfeAt: number | null
  maeAt: number | null
  /** цена лучшей и худшей точки */
  mfePrice: number
  maePrice: number
}

const ok = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0

export function excursion(
  candles: ExcursionCandle[],
  intervalMs: number,
  t: { side: Side; entry_price: number; exit_price: number | null; entry_at: string; exit_at: string | null; stop_loss: number | null; size_usd: number },
  nowMs = Date.now(),
): Excursion | null {
  const entry = t.entry_price
  if (!ok(entry)) return null
  const from = Date.parse(t.entry_at)
  const to = t.exit_at ? Date.parse(t.exit_at) : nowMs
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null
  const inside = candles.filter((c) => c.t + intervalMs > from && c.t <= to && ok(c.h) && ok(c.l))
  const exit = t.exit_at && ok(t.exit_price) ? t.exit_price : null

  let hi = Math.max(entry, exit ?? entry)
  let lo = Math.min(entry, exit ?? entry)
  let hiAt: number | null = null
  let loAt: number | null = null
  for (const c of inside) {
    if (c.h > hi) {
      hi = c.h
      hiAt = c.t
    }
    if (c.l < lo) {
      lo = c.l
      loAt = c.t
    }
  }
  const long = t.side === 'long'
  const mfe = Math.max(0, long ? hi - entry : entry - lo)
  const mae = Math.max(0, long ? entry - lo : hi - entry)
  const qty = ok(t.size_usd) ? t.size_usd / entry : null
  const risk = ok(t.stop_loss) && t.stop_loss !== entry ? Math.abs(entry - t.stop_loss) : null
  const captured = exit === null ? null : long ? exit - entry : entry - exit
  return {
    mfe,
    mae,
    mfePct: mfe / entry,
    maePct: mae / entry,
    mfeUsd: qty === null ? null : mfe * qty,
    maeUsd: qty === null ? null : mae * qty,
    mfeR: risk === null ? null : mfe / risk,
    maeR: risk === null ? null : mae / risk,
    efficiency: captured === null || mfe <= 0 ? null : Math.max(-9.99, Math.min(1, captured / mfe)),
    mfeAt: long ? hiAt : loAt,
    maeAt: long ? loAt : hiAt,
    mfePrice: long ? hi : lo,
    maePrice: long ? lo : hi,
  }
}
