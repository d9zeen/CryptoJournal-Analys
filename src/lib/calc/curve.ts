/**
 * Сделки подключённых бирж за всё время (по API и файлом, двойники склеены): число сделок по биржам для блока «Подключено» (features/connections/LinkedOrbit, 19.11.2026).
 * Владелец: «за всё время» — все закрытые сделки подключённых бирж (по API и файлом), по времени закрытия.
 * Точек не больше max: в каждом куске оставляем его минимум и максимум (как downsampleEquity у кривой капитала),
 * первую и последнюю — всегда, поэтому итог и пики не теряются.
 */
export type CurveTrade = { exchange: string; exit_at: string | null; pnl: number | null }
export type Curve = {
  /** накопленный результат: [0, после 1-й, после 2-й, …] (после прореживания) */
  values: number[]
  /** биржа каждой точки (точка 0 — биржа первой сделки) */
  from: string[]
  /** сколько сделок всего и по биржам */
  count: number
  perExchange: Map<string, number>
  /** время закрытия первой сделки (ISO) */
  since: string | null
}

export function buildCurve(trades: CurveTrade[], exchanges: string[], max = 300): Curve {
  const list = trades
    .filter((t) => t.exit_at && t.pnl !== null && Number.isFinite(Number(t.pnl)) && exchanges.includes(t.exchange))
    .sort((a, z) => Date.parse(a.exit_at!) - Date.parse(z.exit_at!))
  const perExchange = new Map<string, number>()
  for (const t of list) perExchange.set(t.exchange, (perExchange.get(t.exchange) ?? 0) + 1)
  let eq = 0
  const pts = [{ v: 0, ex: list[0]?.exchange ?? '' }, ...list.map((t) => ({ v: (eq += Number(t.pnl)), ex: t.exchange }))]
  const thin = pts.length <= max ? pts : thinOut(pts, max)
  return { values: thin.map((p) => p.v), from: thin.map((p) => p.ex), count: list.length, perExchange, since: list[0]?.exit_at ?? null }
}

function thinOut<T extends { v: number }>(pts: T[], max: number): T[] {
  const inner = pts.length - 2
  const buckets = Math.max(1, Math.floor((max - 2) / 2))
  const size = Math.ceil(inner / buckets)
  const out: T[] = [pts[0]]
  for (let i = 1; i < pts.length - 1; i += size) {
    const chunk = pts.slice(i, Math.min(i + size, pts.length - 1))
    let lo = 0
    let hi = 0
    chunk.forEach((p, k) => {
      if (p.v < chunk[lo].v) lo = k
      if (p.v > chunk[hi].v) hi = k
    })
    if (lo === hi) out.push(chunk[lo])
    else out.push(...(lo < hi ? [chunk[lo], chunk[hi]] : [chunk[hi], chunk[lo]]))
  }
  out.push(pts[pts.length - 1])
  return out
}
