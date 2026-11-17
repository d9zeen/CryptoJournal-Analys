/**
 * «Двойники» сделок: одна и та же сделка, пришедшая разными путями — файлом и по API (16.11.2026, найдено у владельца).
 *
 * 1. Сделка в сделку: Bybit файлом — id «f:…» по исполнениям, по API — «o:…» по ордеру; номера разные, сделка одна.
 *    Признаки: та же пара, то же направление, время закрытия ±3 минуты (в файле — до минуты), тот же PnL (до 0,1 %).
 * 2. Куски в целую: по API Bybit отдаёт каждое частичное закрытие отдельно (JUP +310,94 и +817,55), а в файле позиция —
 *    одной строкой (+1 128,49). Признаки: куски той же пары и направления закрылись внутри целой сделки (от её открытия
 *    до закрытия ±3 мин), последний кусок — в момент закрытия целой, сумма PnL кусков = PnL целой (до 0,2 %).
 *    Работает в обе стороны: новые куски к записанной целой и новая целая к записанным кускам.
 * Каждая записанная сделка «гасит» новые только один раз: две настоящие одинаковые сделки подряд не склеятся.
 */
export type TwinCandidate = { external_id: string; symbol: string; side: string; exit_at: string; pnl: number | null; entry_at?: string | null }
export type TwinRow = { external_id: string | null; symbol: string; side: string; exit_at: string; pnl: number | null; entry_at?: string | null }

export const TWIN_WINDOW_MS = 3 * 60_000
/** Позиция дольше этого — кусками не сравниваем (окно поиска было бы слишком большим) */
const MAX_POSITION_MS = 90 * 86_400_000

const close = (a: number | null, b: number | null, rel = 0.001) => a !== null && b !== null && Math.abs(a - b) <= Math.max(0.02, Math.abs(a) * rel)

type Item = { id: string | null; t: number; open: number | null; sym: string; side: string; pnl: number | null; used: boolean }
const toItem = (r: TwinCandidate | TwinRow): Item | null => {
  const t = Date.parse(r.exit_at)
  if (!Number.isFinite(t)) return null
  const o = r.entry_at ? Date.parse(r.entry_at) : NaN
  return { id: r.external_id, t, open: Number.isFinite(o) && o < t && t - o <= MAX_POSITION_MS ? o : null, sym: r.symbol.toUpperCase(), side: r.side, pnl: r.pnl, used: false }
}

/**
 * Куски внутри целой сделки, последний — в момент её закрытия, сумма PnL = PnL целой.
 * Берём последние k кусков (частичные закрытия идут подряд перед полным): k = 2, 3, … пока сумма не сойдётся.
 */
function piecesOf(whole: Item, pool: Item[]): Item[] | null {
  if (whole.open === null || whole.pnl === null) return null
  const inside = pool
    .filter((p) => !p.used && p.sym === whole.sym && p.side === whole.side && p.pnl !== null && p.t >= whole.open! - TWIN_WINDOW_MS && p.t <= whole.t + TWIN_WINDOW_MS)
    .sort((a, b) => a.t - b.t)
  if (inside.length < 2 || Math.abs(inside[inside.length - 1].t - whole.t) > TWIN_WINDOW_MS) return null
  let sum = 0
  for (let k = 1; k <= inside.length; k++) {
    sum += inside[inside.length - k].pnl!
    if (k >= 2 && close(whole.pnl, sum, 0.002)) return inside.slice(inside.length - k)
  }
  return null
}

/** external_id новых сделок, у которых уже есть записанный двойник (с другим номером или кусками) */
export function findTwins(trades: TwinCandidate[], existing: TwinRow[]): Set<string> {
  const out = new Set<string>()
  const ids = new Set(trades.map((t) => t.external_id))
  // тот же номер — это обычный дубль, его отсекает проверка по номеру; здесь такие записанные не трогаем
  const pool = existing.filter((r) => !r.external_id || !ids.has(r.external_id)).map(toItem).filter((x): x is Item => x !== null)
  const fresh = trades.map(toItem).filter((x): x is Item => x !== null)

  // 1. сделка в сделку
  for (const n of fresh) {
    const hit = pool.find((r) => !r.used && r.sym === n.sym && r.side === n.side && Math.abs(r.t - n.t) <= TWIN_WINDOW_MS && close(r.pnl, n.pnl))
    if (hit) {
      hit.used = true
      n.used = true
      out.add(n.id!)
    }
  }
  // 2а. новые куски → записанная целая
  for (const whole of pool) {
    if (whole.used) continue
    const pieces = piecesOf(whole, fresh)
    if (!pieces) continue
    whole.used = true
    for (const p of pieces) {
      p.used = true
      out.add(p.id!)
    }
  }
  // 2б. новая целая → записанные куски
  for (const whole of fresh) {
    if (whole.used) continue
    const pieces = piecesOf(whole, pool)
    if (!pieces) continue
    for (const p of pieces) p.used = true
    whole.used = true
    out.add(whole.id!)
  }
  return out
}

/** Окно времени, в котором искать двойников у этих сделок (от самого раннего открытия; null — сделок нет) */
export function twinRange(trades: TwinCandidate[]): { from: string; to: string } | null {
  const ts = trades.map((t) => Date.parse(t.exit_at)).filter(Number.isFinite)
  if (!ts.length) return null
  const opens = trades.map((t) => (t.entry_at ? Date.parse(t.entry_at) : NaN)).filter((x) => Number.isFinite(x))
  // куски целой сделки закрываются после её открытия; целая из файла открыта раньше своих кусков — берём с запасом на позицию
  const from = Math.min(...ts, ...opens.filter((o) => Math.min(...ts) - o <= MAX_POSITION_MS)) - TWIN_WINDOW_MS
  return { from: new Date(from).toISOString(), to: new Date(Math.max(...ts) + MAX_POSITION_MS + TWIN_WINDOW_MS).toISOString() }
}
