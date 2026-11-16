/**
 * «Двойники» сделок: одна и та же сделка, пришедшая разными путями — файлом и по API (16.11.2026, найдено у владельца:
 * Bybit файлом — id «f:…» по исполнениям, по API — «o:…» по ордеру; номера разные, сделка одна → кривая капитала удваивалась).
 * Признаки одной сделки: та же пара, то же направление, время закрытия ±3 минуты (в файле — до минуты), тот же PnL (до 0,1 %).
 * Каждая уже записанная сделка «гасит» не больше одной новой: две настоящие одинаковые сделки подряд не склеятся.
 */
export type TwinCandidate = { external_id: string; symbol: string; side: string; exit_at: string; pnl: number | null }
export type TwinRow = { external_id: string | null; symbol: string; side: string; exit_at: string; pnl: number | null }

export const TWIN_WINDOW_MS = 3 * 60_000

const close = (a: number | null, b: number | null) => a !== null && b !== null && Math.abs(a - b) <= Math.max(0.02, Math.abs(a) * 0.001)

/** external_id новых сделок, у которых уже есть записанный двойник (с другим номером) */
export function findTwins(trades: TwinCandidate[], existing: TwinRow[]): Set<string> {
  const out = new Set<string>()
  const pool = existing
    .map((r) => ({ ...r, t: Date.parse(r.exit_at), sym: r.symbol.toUpperCase(), used: false }))
    .filter((r) => Number.isFinite(r.t))
    .sort((a, b) => a.t - b.t)
  for (const tr of trades) {
    const t = Date.parse(tr.exit_at)
    if (!Number.isFinite(t)) continue
    const sym = tr.symbol.toUpperCase()
    const hit = pool.find((r) => !r.used && r.external_id !== tr.external_id && r.sym === sym && r.side === tr.side && Math.abs(r.t - t) <= TWIN_WINDOW_MS && close(r.pnl, tr.pnl))
    if (hit) {
      hit.used = true
      out.add(tr.external_id)
    }
  }
  return out
}

/** Окно времени, в котором искать двойников у этих сделок (null — сделок нет) */
export function twinRange(trades: TwinCandidate[]): { from: string; to: string } | null {
  const ts = trades.map((t) => Date.parse(t.exit_at)).filter(Number.isFinite)
  if (!ts.length) return null
  return { from: new Date(Math.min(...ts) - TWIN_WINDOW_MS).toISOString(), to: new Date(Math.max(...ts) + TWIN_WINDOW_MS).toISOString() }
}
