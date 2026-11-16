/**
 * Портфель, этап 2 (0020): история спотовых покупок / продаж с бирж → исполнения spot_fills.
 * Из них считается средняя цена входа и зафиксированная прибыль (lib/calc/portfolio.ts → costBasis).
 * Общий код для браузера (через exchange-proxy) и сервера (sync-worker): запросы приходят снаружи (CexCall), только чтение.
 *
 *  - Bybit: /v5/execution/list?category=spot — окна по 7 дней, первый раз за 2 года;
 *  - Binance: /api/v3/myTrades — по парам монет, которые сейчас на балансе (к USDT / USDC / FDUSD), с первой сделки по номерам;
 *  - OKX: /api/v5/trade/fills-history?instType=SPOT — последние 3 месяца (больше OKX не хранит).
 * Повторы безопасны: в базе unique (подключение, external_id), поэтому следующая загрузка берёт с запасом в сутки.
 */
import { BybitError, type BybitCall } from '@/lib/sync/bybit'
import { binanceGet } from '@/lib/sync/binance'
import { okxGet } from '@/lib/sync/okx'
import { DAY, ExchangeError, inBatches, windows, type CexCall } from '@/lib/sync/cex'

export type SpotFill = {
  external_id: string
  asset: string
  quote: string
  side: 'buy' | 'sell'
  qty: number
  price: number
  fee: number
  fee_asset: string | null
  at: string
}

/** Валюты котировки, по которым узнаём пару BTCUSDT → BTC / USDT (длинные — первыми) */
const QUOTES = ['FDUSD', 'USDT', 'USDC', 'USDE', 'TUSD', 'BUSD', 'USD1', 'DAI', 'EUR', 'TRY', 'BTC', 'ETH', 'BNB', 'USD']
/** Котировки, которые считаем равными доллару — только по ним считается цена входа */
export const USD_QUOTES: ReadonlySet<string> = new Set(['USDT', 'USDC', 'FDUSD', 'USDE', 'TUSD', 'BUSD', 'USD1', 'DAI', 'USD'])

const n = (v: unknown): number => {
  const x = typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : NaN
  return Number.isFinite(x) ? x : 0
}
const clean = (s: unknown) => (typeof s === 'string' ? s.trim().toUpperCase() : '')
const okSym = (s: string) => /^[A-Z0-9._-]{1,24}$/.test(s)

/** BTCUSDT / BTC-USDT / BTC_USDT → { asset: BTC, quote: USDT } */
export function splitPair(symbol: string): { asset: string; quote: string } | null {
  const s = clean(symbol)
  const parts = s.split(/[-_/]/)
  if (parts.length === 2 && okSym(parts[0]) && okSym(parts[1])) return { asset: parts[0], quote: parts[1] }
  for (const q of QUOTES) if (s.endsWith(q) && s.length > q.length && okSym(s.slice(0, -q.length))) return { asset: s.slice(0, -q.length), quote: q }
  return null
}

function fill(id: string, pair: { asset: string; quote: string } | null, side: unknown, qty: unknown, price: unknown, fee: unknown, feeAsset: unknown, ts: unknown): SpotFill | null {
  const q = n(qty)
  const p = n(price)
  const t = n(ts)
  const sd = String(side).toLowerCase()
  if (!pair || q <= 0 || p <= 0 || t <= 0 || (sd !== 'buy' && sd !== 'sell')) return null
  const fa = clean(feeAsset)
  return {
    external_id: id.slice(0, 120),
    asset: pair.asset,
    quote: pair.quote,
    side: sd,
    qty: q,
    price: p,
    fee: Math.abs(n(fee)),
    fee_asset: okSym(fa) ? fa : null,
    at: new Date(t < 1e12 ? t * 1000 : t).toISOString(),
  }
}
const only = (xs: (SpotFill | null)[]) => xs.filter((x): x is SpotFill => x !== null)

// ---------- Bybit ----------
export const BYBIT_SPOT_DAYS = 730
export async function bybitSpotFills(call: CexCall, from: number, to: number): Promise<SpotFill[]> {
  const c = call as BybitCall
  const out: SpotFill[] = []
  await inBatches(windows(from, to, 7 * DAY), 4, async ([start, end]) => {
    let cursor = ''
    for (let page = 0; page < 50; page++) {
      const r = await c('/v5/execution/list', { category: 'spot', startTime: start, endTime: end, limit: 100, ...(cursor ? { cursor } : {}) })
      if (!r || r.retCode !== 0) throw new BybitError(r?.retCode ?? -1, r?.retMsg ?? 'no response')
      const res = r.result as { list?: Record<string, unknown>[]; nextPageCursor?: string }
      for (const x of res.list ?? []) {
        const pair = splitPair(String(x.symbol))
        const buy = String(x.side) === 'Buy'
        // комиссия спота у Bybit: при покупке — в монете, при продаже — в котировке (если биржа не прислала feeCurrency)
        out.push(...only([fill(`bb:${x.execId}`, pair, buy ? 'buy' : 'sell', x.execQty, x.execPrice, x.execFee, x.feeCurrency || (buy ? pair?.asset : pair?.quote), x.execTime)]))
      }
      cursor = res.nextPageCursor ?? ''
      if (!cursor || !(res.list ?? []).length) break
    }
  })
  return out
}

// ---------- Binance ----------
const BINANCE_QUOTES = ['USDT', 'USDC', 'FDUSD']
/**
 * assets — монеты на балансе (у Binance история сделок — только по конкретной паре, поэтому собираем пары к USDT / USDC / FDUSD).
 * from = null — вся история (по номерам сделок с нуля); иначе — последние 1000 сделок пары, а если и они все новее from —
 * всё равно вся история (у Binance «с такого-то времени» ограничено сутками).
 */
export async function binanceSpotFills(call: CexCall, assets: string[], from: number | null): Promise<SpotFill[]> {
  const out: SpotFill[] = []
  const symbols = [...new Set(assets.map(clean))].filter((a) => okSym(a) && !USD_QUOTES.has(a)).flatMap((a) => BINANCE_QUOTES.map((q) => ({ symbol: a + q, pair: { asset: a, quote: q } })))
  const get = async (symbol: string, extra: Record<string, number>) => {
    try {
      const rows = await binanceGet<Record<string, unknown>[]>(call, '/api/v3/myTrades', { symbol, limit: 1000, ...extra })
      return Array.isArray(rows) ? rows : []
    } catch (e) {
      // такой пары нет (-1121) — просто пропускаем; ошибка ключа и частоты — наверх
      if (e instanceof ExchangeError && e.kind === 'EXCHANGE') return null
      throw e
    }
  }
  const add = (symbol: string, pair: { asset: string; quote: string }, rows: Record<string, unknown>[]) => {
    for (const x of rows) out.push(...only([fill(`bn:${symbol}:${x.id}`, pair, x.isBuyer ? 'buy' : 'sell', x.qty, x.price, x.commission, x.commissionAsset, x.time)]))
  }
  await inBatches(symbols, 3, async ({ symbol, pair }) => {
    if (from !== null) {
      const latest = await get(symbol, {})
      if (latest === null) return
      if (latest.length < 1000 || Math.min(...latest.map((x) => n(x.time))) <= from) {
        add(symbol, pair, latest.filter((x) => n(x.time) >= from))
        return
      }
    }
    let fromId = 0
    for (let page = 0; page < 100; page++) {
      const rows = await get(symbol, { fromId })
      if (!rows || !rows.length) return
      add(symbol, pair, rows)
      if (rows.length < 1000) return
      fromId = Math.max(...rows.map((x) => n(x.id))) + 1
    }
  })
  return out
}

// ---------- OKX ----------
export async function okxSpotFills(call: CexCall, from: number): Promise<SpotFill[]> {
  const out: SpotFill[] = []
  let after = ''
  for (let page = 0; page < 200; page++) {
    const rows = await okxGet<Record<string, unknown>>(call, '/api/v5/trade/fills-history', { instType: 'SPOT', limit: 100, ...(after ? { after } : {}) })
    if (!rows.length) break
    for (const x of rows) out.push(...only([fill(`ok:${x.tradeId}:${x.billId}`, splitPair(String(x.instId)), x.side, x.fillSz, x.fillPx, x.fee, x.feeCcy, x.ts)]))
    const oldest = Math.min(...rows.map((x) => n(x.ts)))
    after = String(rows[rows.length - 1].billId ?? '')
    if (rows.length < 100 || oldest < from || !after) break
  }
  return out.filter((f) => Date.parse(f.at) >= from)
}

/** Какие биржи умеют отдавать историю спота (у остальных — цена входа руками) */
export const SPOT_HISTORY: ReadonlySet<string> = new Set(['bybit', 'binance', 'okx'])

/**
 * Новые исполнения подключения с прошлого раза (cursor — ISO или null: первый раз — вся доступная история).
 * Возвращает исполнения и новый курсор (сейчас) или null, если биржа историю спота не отдаёт.
 */
export async function fetchSpotFills(
  conn: { exchange: string },
  call: CexCall,
  opts: { cursor: string | null; assets: string[]; now?: number },
): Promise<{ fills: SpotFill[]; cursor: string } | null> {
  const now = opts.now ?? Date.now()
  // с запасом в сутки: биржа может отдать исполнение позже, повторы база отбросит
  const since = opts.cursor ? Date.parse(opts.cursor) - DAY : null
  let fills: SpotFill[]
  switch (conn.exchange) {
    case 'bybit':
      fills = await bybitSpotFills(call, Math.max(since ?? 0, now - BYBIT_SPOT_DAYS * DAY), now)
      break
    case 'binance':
      fills = await binanceSpotFills(call, opts.assets, since)
      break
    case 'okx':
      fills = await okxSpotFills(call, Math.max(since ?? 0, now - 90 * DAY))
      break
    default:
      return null
  }
  return { fills: [...new Map(fills.map((f) => [f.external_id, f])).values()], cursor: new Date(now).toISOString() }
}
