/**
 * Polymarket → сделки. Нужен только адрес кошелька аккаунта Polymarket (proxy / deposit wallet из профиля, не адрес подписи).
 * Источник — Data API v2: GET /v2/positions?user=…&status=CLOSED — закрытые позиции с итоговым PnL.
 * Сделка = закрытая позиция по исходу (Yes / No…): вход — средняя цена покупки, выход — средняя цена продажи / погашения
 * (из PnL: выход = вход + PnL / число долей; проигравший исход — 0).
 * Настоящий ответ v2 (сверено 05.11.2026): snake_case — condition_id, avg_price, total_size (доли), realized_pnl, title, outcome,
 * first_entry_at / last_event_at (секунды); { data: [...], pagination: { next_cursor, has_more } }. Старые camelCase-поля тоже понимаем.
 */
import { round } from '@/lib/calc/trade'
import type { ImportedTrade } from '@/lib/import/types'

export const PM_API = 'https://data-api.polymarket.com'

/** Запрос к Data API: path + параметры → JSON */
export type PmGet = (path: string, params: Record<string, string | number>) => Promise<unknown>

type Obj = Record<string, unknown>
const pick = (o: Obj, ...keys: string[]) => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]
  return undefined
}
const num = (o: Obj, ...keys: string[]) => {
  const v = pick(o, ...keys)
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}
const str = (o: Obj, ...keys: string[]) => {
  const v = pick(o, ...keys)
  return typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : null
}

const toIso = (ts: number | null) => (ts !== null && ts > 0 ? new Date(ts < 1e12 ? ts * 1000 : ts).toISOString() : null)

/** Время закрытия: последнее событие позиции (секунды или мс), иначе дата окончания рынка */
function closeTime(p: Obj): string | null {
  const iso = toIso(num(p, 'last_event_at', 'lastEventAt', 'timestamp', 'closedAt', 'closed_at', 'updatedAt', 'updated_at'))
  if (iso) return iso
  const d = str(p, 'endDate', 'end_date', 'closedAt', 'closed_at')
  if (d && !Number.isNaN(Date.parse(d))) return new Date(Date.parse(d)).toISOString()
  return null
}

/** Одна закрытая позиция → сделка (null — данных не хватает) */
export function pmPositionToTrade(p: Obj): ImportedTrade | null {
  const cond = str(p, 'conditionId', 'condition_id', 'market')
  const avg = num(p, 'avgPrice', 'avg_price')
  const shares = num(p, 'total_size', 'totalSize', 'totalBought', 'total_bought', 'size')
  const pnl = num(p, 'realizedPnl', 'realized_pnl', 'cashPnl', 'cash_pnl')
  const at = closeTime(p)
  if (!cond || avg === null || avg <= 0 || !shares || shares <= 0 || pnl === null || !at) return null
  const outcome = str(p, 'outcome') ?? `#${num(p, 'outcomeIndex', 'outcome_index') ?? 0}`
  const title = str(p, 'title', 'question', 'market_title') ?? cond
  const exit = Math.min(1, Math.max(0, avg + pnl / shares))
  // время первой покупки — если есть и не позже закрытия
  const opened = toIso(num(p, 'first_entry_at', 'firstEntryAt'))
  const entryAt = opened && opened <= at ? opened : at
  const code = outcome.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'O'
  return {
    exchange: 'polymarket',
    market_type: 'prediction',
    symbol: `PM-${cond.replace(/^0x/i, '').slice(0, 8).toUpperCase()}-${code}`,
    title: `${title} — ${outcome}`.slice(0, 300),
    side: 'long',
    entry_at: entryAt,
    exit_at: at,
    entry_price: round(avg, 8),
    exit_price: round(exit, 8),
    size_usd: round(shares * avg, 8),
    leverage: 1,
    fee: 0,
    funding: 0,
    pnl: round(pnl, 8),
    pnl_manual: false,
    external_id: `pm:${cond}:${outcome}`.slice(0, 200),
  }
}

/** Все закрытые позиции кошелька: страницы по 50, курсор pagination.next_cursor (в v2 нет offset) */
export async function fetchPmClosed(get: PmGet, user: string): Promise<Obj[]> {
  const out: Obj[] = []
  let cursor = ''
  for (let page = 0; page < 200; page++) {
    const res = (await get('/v2/positions', { user, status: 'CLOSED', limit: 50, ...(cursor ? { cursor } : {}) })) as unknown
    const r = (res ?? {}) as Obj
    const items = (Array.isArray(res) ? res : (pick(r, 'data', 'positions', 'results') as unknown[] | undefined) ?? []) as Obj[]
    out.push(...items)
    const pag = (r.pagination ?? {}) as Obj
    const next = Array.isArray(res) ? '' : (str(pag, 'next_cursor', 'nextCursor') ?? str(r, 'next_cursor', 'nextCursor') ?? '')
    if (!next || !items.length) break
    cursor = next
  }
  return out
}

/** Прямой запрос к Data API (сервер; из браузера — через exchange-proxy) */
export function pmDirectGet(fetchFn: typeof fetch = fetch): PmGet {
  return async (path, params) => {
    const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))
    const res = await fetchFn(`${PM_API}${path}?${q}`)
    if (!res.ok) throw new Error(`PM_HTTP_${res.status} network`)
    return res.json()
  }
}
