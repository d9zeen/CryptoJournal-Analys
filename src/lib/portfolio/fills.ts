/**
 * Портфель, этап 2 (0020): история спотовых покупок / продаж с бирж → исполнения spot_fills.
 * Из них считается средняя цена входа и зафиксированная прибыль (lib/calc/portfolio.ts → costBasis).
 * Общий код для браузера (через exchange-proxy) и сервера (sync-worker): запросы приходят снаружи (CexCall), только чтение.
 *
 *  - Bybit: /v5/execution/list?category=spot — окна по 7 дней, первый раз за 2 года; плюс «Конвертация» (владелец 19.11.2026: тоже спот) —
 *    /v5/asset/exchange/query-convert-history (новая, с 10.09.2025 и с сайта) и /v5/asset/exchange/order-record (старый «Обмен монет»):
 *    USDT → монета = покупка по курсу обмена, монета → USDT = продажа; монета ↔ монета и стейбл ↔ стейбл — без долларовой цены, мимо;
 *  - Binance: /api/v3/myTrades — по парам монет, которые сейчас на балансе (к USDT / USDC / FDUSD), с первой сделки по номерам;
 *  - OKX: /api/v5/trade/fills-history?instType=SPOT — последние 3 месяца (больше OKX не хранит);
 *  - Bitget: единый аккаунт — /api/v3/trade/fills?category=SPOT (окна по 30 дней), классический — /api/v2/spot/trade/fills; 90 дней;
 *  - BingX: /openApi/spot/v1/trade/myTrades — по парам монет с баланса, только последние 7 дней (дальше копится с каждой загрузкой);
 *  - Hyperliquid: userFillsByTime по адресу (спот — монеты «@N» и «PURR/USDC», названия из spotMeta), последние 10 000 исполнений.
 * Повторы безопасны: в базе unique (подключение, external_id), поэтому следующая загрузка берёт с запасом в сутки.
 */
import { BybitError, type BybitCall } from '@/lib/sync/bybit'
import { binanceGet } from '@/lib/sync/binance'
import { okxGet } from '@/lib/sync/okx'
import { bitgetGet } from '@/lib/sync/bitget'
import { bingxGet } from '@/lib/sync/bingx'
import { HL_API, fetchHlFills, type HlFill } from '@/lib/sync/hyperliquid'
import { cleanSymbol, isTransient } from '@/lib/portfolio/balances'
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

/**
 * Обмен «из → в» как исполнение: из доллара в монету — покупка (цена = сколько отдал / сколько получил),
 * из монеты в доллар — продажа; иначе — null (нет долларовой цены). Комиссия у конвертации уже внутри курса
 */
export function convertFill(id: string, fromCoin: unknown, fromAmount: unknown, toCoin: unknown, toAmount: unknown, ts: unknown): SpotFill | null {
  const from = cleanSymbol(fromCoin)
  const to = cleanSymbol(toCoin)
  const fa = n(fromAmount)
  const ta = n(toAmount)
  if (!from || !to || fa <= 0 || ta <= 0) return null
  if (USD_QUOTES.has(from) && !USD_QUOTES.has(to)) return fill(id, { asset: to, quote: from }, 'buy', ta, fa / ta, 0, null, ts)
  if (USD_QUOTES.has(to) && !USD_QUOTES.has(from)) return fill(id, { asset: from, quote: to }, 'sell', fa, ta / fa, 0, null, ts)
  return null
}

/** Конвертации Bybit (обе истории). Нет прав / не поддерживается — пусто; временный сбой — наверх (повторим в следующий раз) */
export async function bybitConvertFills(call: CexCall): Promise<SpotFill[]> {
  const c = call as BybitCall
  const out: SpotFill[] = []
  const safe = async (fn: () => Promise<void>) => {
    try {
      await fn()
    } catch (e) {
      if (isTransient(e)) throw e
    }
  }
  const get = async (path: string, params: Record<string, string | number>) => {
    const r = await c(path, params)
    if (!r || r.retCode !== 0) throw new BybitError(r?.retCode ?? -1, r?.retMsg ?? 'no response')
    return r.result as Record<string, unknown>
  }
  await safe(async () => {
    for (let index = 1; index <= 50; index++) {
      const list = ((await get('/v5/asset/exchange/query-convert-history', { index, limit: 100 })).list ?? []) as Record<string, unknown>[]
      for (const x of list) {
        if (x.exchangeStatus !== undefined && String(x.exchangeStatus).toLowerCase() !== 'success') continue
        out.push(...only([convertFill(`bb:cv:${x.exchangeTxId}`, x.fromCoin, x.fromAmount, x.toCoin, x.toAmount, x.createdAt)]))
      }
      if (list.length < 100) break
    }
  })
  await safe(async () => {
    let cursor = ''
    for (let page = 0; page < 50; page++) {
      const res = await get('/v5/asset/exchange/order-record', { limit: 50, ...(cursor ? { cursor } : {}) })
      const list = (res.orderBody ?? []) as Record<string, unknown>[]
      for (const x of list) out.push(...only([convertFill(`bb:cv:${x.exchangeTxId}`, x.fromCoin, x.fromAmount, x.toCoin, x.toAmount, x.createdTime)]))
      cursor = String(res.nextPageCursor ?? '')
      if (!cursor || !list.length) break
    }
  })
  // одна и та же конвертация в обеих историях: тот же номер — или та же монета, сторона и количество в ту же минуту
  const seen = new Set<string>()
  return out.filter((f) => {
    const keys = [f.external_id, `${f.asset}|${f.side}|${f.qty.toPrecision(10)}|${f.at.slice(0, 16)}`]
    if (keys.some((k) => seen.has(k))) return false
    keys.forEach((k) => seen.add(k))
    return true
  })
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

// ---------- Bitget ----------
type Obj = Record<string, unknown>
const BITGET_DAYS = 90
/** Комиссия Bitget: у классического — объект {feeCoin, totalFee}, у единого — массив [{feeCoin, fee}] (знак — минус) */
function bitgetFee(d: unknown): { fee: number; coin: unknown } {
  if (Array.isArray(d)) {
    const x = (d as Obj[]).find((f) => n(f.fee) !== 0) ?? (d as Obj[])[0]
    return { fee: n(x?.fee), coin: x?.feeCoin }
  }
  const o = (d ?? {}) as Obj
  return { fee: n(o.totalFee), coin: o.feeCoin }
}
export async function bitgetSpotFills(call: CexCall, from: number, to: number): Promise<SpotFill[]> {
  const out: SpotFill[] = []
  const add = (x: Obj, id: unknown, price: unknown, qty: unknown, ts: unknown) => {
    const f = bitgetFee(x.feeDetail)
    out.push(...only([fill(`bg:${id}`, splitPair(String(x.symbol)), x.side, qty, price, f.fee, f.coin, ts)]))
  }
  // единый аккаунт (UTA): окна по 30 дней, страницы по курсору
  const probe = (await call('/api/v3/trade/fills', { category: 'SPOT', startTime: Math.max(from, to - 30 * DAY), endTime: to, limit: 100 })) as { code?: string } | null
  if (probe?.code === '00000') {
    for (const [start, end] of windows(from, to, 30 * DAY)) {
      let cursor = ''
      for (let page = 0; page < 100; page++) {
        const d = await bitgetGet<{ list?: Obj[]; cursor?: string }>(call, '/api/v3/trade/fills', { category: 'SPOT', startTime: start, endTime: end, limit: 100, ...(cursor ? { cursor } : {}) })
        const list = d?.list ?? []
        for (const x of list) add(x, x.execId, x.execPrice, x.execQty, x.createdTime)
        if (list.length < 100 || !d.cursor || d.cursor === cursor) break
        cursor = String(d.cursor)
      }
    }
    return out
  }
  // классический: все пары сразу, страницы — по номеру сделки назад
  let idLessThan = ''
  for (let page = 0; page < 200; page++) {
    const rows = await bitgetGet<Obj[]>(call, '/api/v2/spot/trade/fills', { startTime: from, endTime: to, limit: 100, ...(idLessThan ? { idLessThan } : {}) })
    const list = Array.isArray(rows) ? rows : []
    for (const x of list) add(x, x.tradeId, x.priceAvg, x.size, x.cTime)
    if (list.length < 100) break
    const last = String(list[list.length - 1].tradeId ?? '')
    if (!last || last === idLessThan) break
    idLessThan = last
  }
  return out
}

// ---------- BingX ----------
const BINGX_DAYS = 7
const BINGX_QUOTES = ['USDT', 'USDC']
/** История BingX — только по паре (BTC-USDT) и только за 7 дней; пары — из монет на балансе */
export async function bingxSpotFills(call: CexCall, assets: string[], from: number, to: number): Promise<SpotFill[]> {
  const out: SpotFill[] = []
  const symbols = [...new Set(assets.map(clean))].filter((a) => okSym(a) && !USD_QUOTES.has(a)).flatMap((a) => BINGX_QUOTES.map((q) => ({ asset: a, quote: q })))
  await inBatches(symbols, 3, async (pair) => {
    const symbol = `${pair.asset}-${pair.quote}`
    let start = from
    for (let page = 0; page < 20; page++) {
      let rows: Obj[]
      try {
        const d = await bingxGet<{ fills?: Obj[] }>(call, '/openApi/spot/v1/trade/myTrades', { symbol, startTime: start, endTime: to, limit: 1000 })
        rows = Array.isArray(d?.fills) ? d.fills : []
      } catch (e) {
        // такой пары нет — пропускаем; ошибка ключа и частоты — наверх
        if (e instanceof ExchangeError && e.kind === 'EXCHANGE') return
        throw e
      }
      for (const x of rows) out.push(...only([fill(`bx:${symbol}:${x.id}`, pair, x.isBuyer ? 'buy' : 'sell', x.qty, x.price, x.commission, x.commissionAsset, x.time)]))
      if (rows.length < 1000) return
      const next = Math.max(...rows.map((x) => n(x.time)))
      if (next <= start) return
      start = next // то же время ещё раз — повторы отбросит Map ниже и база
    }
  })
  return out
}

// ---------- Hyperliquid (по адресу, без ключа) ----------
type SpotMeta = { universe?: { name?: string; tokens?: number[]; index?: number }[]; tokens?: { name?: string; index?: number }[] }
/** «@107» / «PURR/USDC» → монета и котировка по spotMeta (обёртки UBTC, UETH → BTC, ETH — как в балансах) */
export function hlSpotPairs(meta: SpotMeta): Map<string, { asset: string; quote: string }> {
  const tokens = new Map((meta.tokens ?? []).map((t) => [t.index, t.name ?? '']))
  const out = new Map<string, { asset: string; quote: string }>()
  for (const u of meta.universe ?? []) {
    const [b, q] = u.tokens ?? []
    const asset = cleanSymbol(tokens.get(b))
    const quote = cleanSymbol(tokens.get(q))
    if (!asset || !quote) continue
    const pair = { asset, quote }
    if (u.name) out.set(u.name, pair)
    if (u.index !== undefined) out.set(`@${u.index}`, pair)
  }
  return out
}
export async function hyperliquidSpotFills(address: string, from: number, fetchFn: typeof fetch = fetch): Promise<SpotFill[]> {
  const res = await fetchFn(HL_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'spotMeta' }) })
  if (!res.ok) throw new Error(`HL_HTTP_${res.status} network`)
  const pairs = hlSpotPairs((await res.json()) as SpotMeta)
  const fills: HlFill[] = await fetchHlFills(address, from, fetchFn)
  return only(
    fills
      .filter((f) => f.coin.startsWith('@') || f.coin.includes('/'))
      .map((f) => fill(`hl:${f.tid}`, pairs.get(f.coin) ?? null, f.side === 'B' ? 'buy' : 'sell', f.sz, f.px, f.fee, cleanSymbol(f.feeToken ?? 'USDC'), f.time)),
  )
}

/** Какие биржи умеют отдавать историю спота (у остальных — цена входа руками) */
export const SPOT_HISTORY: ReadonlySet<string> = new Set(['bybit', 'binance', 'okx', 'bitget', 'bingx', 'hyperliquid'])

/**
 * Новые исполнения подключения с прошлого раза (cursor — ISO или null: первый раз — вся доступная история).
 * Возвращает исполнения и новый курсор (сейчас) или null, если биржа историю спота не отдаёт.
 * call — запросы к бирже с ключом (exchange-proxy / sync-worker); Hyperliquid — по адресу (api_key), напрямую через fetchFn.
 */
export async function fetchSpotFills(
  conn: { exchange: string; api_key?: string },
  call: CexCall,
  opts: { cursor: string | null; assets: string[]; now?: number; fetchFn?: typeof fetch },
): Promise<{ fills: SpotFill[]; cursor: string } | null> {
  const now = opts.now ?? Date.now()
  // с запасом в сутки: биржа может отдать исполнение позже, повторы база отбросит
  const since = opts.cursor ? Date.parse(opts.cursor) - DAY : null
  const back = (days: number) => Math.max(since ?? 0, now - days * DAY)
  let fills: SpotFill[]
  switch (conn.exchange) {
    case 'bybit':
      // конвертации — вся история каждый раз (она короткая, номерами), повторы база отбросит
      fills = [...(await bybitSpotFills(call, back(BYBIT_SPOT_DAYS), now)), ...(await bybitConvertFills(call))]
      break
    case 'binance':
      fills = await binanceSpotFills(call, opts.assets, since)
      break
    case 'okx':
      fills = await okxSpotFills(call, back(90))
      break
    case 'bitget':
      fills = await bitgetSpotFills(call, back(BITGET_DAYS), now)
      break
    case 'bingx':
      fills = await bingxSpotFills(call, opts.assets, back(BINGX_DAYS), now)
      break
    case 'hyperliquid':
      if (!conn.api_key) return null
      fills = await hyperliquidSpotFills(conn.api_key, since ?? 0, opts.fetchFn)
      break
    default:
      return null
  }
  return { fills: [...new Map(fills.map((f) => [f.external_id, f])).values()], cursor: new Date(now).toISOString() }
}
