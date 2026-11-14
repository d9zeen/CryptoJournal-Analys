/**
 * Фильтры и сортировка списка сделок (всё — по уже загруженным сделкам, без запросов к базе).
 * Быстрые фильтры (поиск по паре, Long / Short, Плюс / Минус, сетап) всегда видны над таблицей;
 * остальные (ошибка, эмоция, биржа, статус) — за кнопкой «Фильтры». Всё хранится в адресе (?side=long&result=win…),
 * чтобы ссылка открывала тот же вид.
 */
import type { TradeWithTags } from '@/types/db'
import type { Side } from '@/lib/calc/trade'

export type TradeFilters = {
  exchange: string
  side: '' | Side
  /** win — в плюс, loss — в минус (по PnL; открытые сделки не попадают) */
  result: '' | 'win' | 'loss'
  status: '' | 'open' | 'closed'
  setupId: string
  tagId: string
  emotionId: string
  symbol: string
}

export const EMPTY_FILTERS: TradeFilters = { exchange: '', side: '', result: '', status: '', setupId: '', tagId: '', emotionId: '', symbol: '' }

export function applyFilters(trades: TradeWithTags[], f: TradeFilters): TradeWithTags[] {
  const sym = f.symbol.trim().toUpperCase()
  return trades.filter((tr) => {
    const pnl = tr.pnl === null ? null : Number(tr.pnl)
    return (
      (!f.exchange || tr.exchange === f.exchange) &&
      (!f.side || tr.side === f.side) &&
      (!f.result || (pnl !== null && (f.result === 'win' ? pnl > 0 : pnl < 0))) &&
      (!f.status || (f.status === 'open' ? tr.exit_at === null : tr.exit_at !== null)) &&
      (!f.setupId || tr.setup_id === f.setupId) &&
      (!f.tagId || tr.trade_mistakes.some((m) => m.tag_id === f.tagId)) &&
      (!f.emotionId || tr.emotion_id === f.emotionId) &&
      (!sym || tr.symbol.includes(sym) || (tr.title ?? '').toUpperCase().includes(sym))
    )
  })
}

export function hasActiveFilters(f: TradeFilters): boolean {
  return Object.values(f).some(Boolean)
}

/** Сколько включено фильтров за кнопкой «Фильтры» (быстрые — поиск, сторона, результат, сетап — не считаем: они и так видны) */
export function hiddenFiltersCount(f: TradeFilters): number {
  return [f.exchange, f.status, f.tagId, f.emotionId].filter(Boolean).length
}

/* ---------- Адрес страницы ---------- */

const PARAM: Record<keyof TradeFilters, string> = {
  exchange: 'exchange',
  side: 'side',
  result: 'result',
  status: 'status',
  setupId: 'setup',
  tagId: 'mistake',
  emotionId: 'emotion',
  symbol: 'q',
}

export type SortKey = 'date' | 'symbol' | 'size' | 'pnl' | 'r' | 'duration'
export type SortDir = 'asc' | 'desc'
export type Sort = { key: SortKey; dir: SortDir }
/** по умолчанию — дата входа, новые сверху */
export const DEFAULT_SORT: Sort = { key: 'date', dir: 'desc' }
const SORT_KEYS: SortKey[] = ['date', 'symbol', 'size', 'pnl', 'r', 'duration']

/** ?side=long&result=win&setup=…&q=btc&sort=pnl&dir=asc → фильтры и сортировка (неизвестные значения — игнорируем) */
export function fromParams(p: URLSearchParams): { filters: TradeFilters; sort: Sort } {
  const get = (k: keyof TradeFilters) => p.get(PARAM[k]) ?? ''
  const side = get('side')
  const result = get('result')
  const status = get('status')
  const key = p.get('sort') as SortKey | null
  return {
    filters: {
      exchange: get('exchange'),
      side: side === 'long' || side === 'short' ? side : '',
      result: result === 'win' || result === 'loss' ? result : '',
      status: status === 'open' || status === 'closed' ? status : '',
      setupId: get('setupId'),
      tagId: get('tagId'),
      emotionId: get('emotionId'),
      symbol: get('symbol'),
    },
    sort: key && SORT_KEYS.includes(key) ? { key, dir: p.get('dir') === 'asc' ? 'asc' : 'desc' } : DEFAULT_SORT,
  }
}

/** Записать фильтры и сортировку в адрес; прочие параметры (например, ?day=) не трогаем */
export function toParams(base: URLSearchParams, f: TradeFilters, sort: Sort): URLSearchParams {
  const p = new URLSearchParams(base)
  for (const k of Object.keys(PARAM) as (keyof TradeFilters)[]) {
    if (f[k]) p.set(PARAM[k], f[k])
    else p.delete(PARAM[k])
  }
  if (sort.key === DEFAULT_SORT.key && sort.dir === DEFAULT_SORT.dir) {
    p.delete('sort')
    p.delete('dir')
  } else {
    p.set('sort', sort.key)
    p.set('dir', sort.dir)
  }
  return p
}

/* ---------- Сортировка ---------- */

/** Время в сделке, мс; открытая сделка — null */
export function durationMs(tr: Pick<TradeWithTags, 'entry_at' | 'exit_at'>): number | null {
  if (!tr.exit_at) return null
  return Math.max(0, Date.parse(tr.exit_at) - Date.parse(tr.entry_at))
}

const sortValue = (tr: TradeWithTags, key: SortKey): number | string | null => {
  switch (key) {
    case 'date':
      return tr.entry_at
    case 'symbol':
      return (tr.title ?? tr.symbol).toUpperCase()
    case 'size':
      return tr.size_usd === null ? null : Number(tr.size_usd)
    case 'pnl':
      return tr.pnl === null ? null : Number(tr.pnl)
    case 'r':
      return tr.r_multiple === null ? null : Number(tr.r_multiple)
    case 'duration':
      return durationMs(tr)
  }
}

/** Сортировка по колонке; пустые значения (открытая сделка, нет R) — всегда в конце; при равенстве — новые сверху */
export function sortTrades(trades: TradeWithTags[], sort: Sort): TradeWithTags[] {
  const sign = sort.dir === 'asc' ? 1 : -1
  return trades
    .map((tr) => ({ tr, v: sortValue(tr, sort.key) }))
    .sort((a, b) => {
      if (a.v === null || b.v === null) return a.v === b.v ? b.tr.entry_at.localeCompare(a.tr.entry_at) : a.v === null ? 1 : -1
      const c = typeof a.v === 'string' ? a.v.localeCompare(b.v as string) : a.v - (b.v as number)
      return c !== 0 ? sign * c : b.tr.entry_at.localeCompare(a.tr.entry_at)
    })
    .map((x) => x.tr)
}
