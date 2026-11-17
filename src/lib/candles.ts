/**
 * Свечи для графика сделки (17.11.2026, «Повтор сделки на графике», план — п. 6).
 *
 * Откуда: публичные API бирж, без ключа, прямо из браузера (CORS у них открыт; адреса — в CSP vite.config.ts):
 *  - сделка Bybit / Binance / OKX / Hyperliquid — свечи той же биржи;
 *  - Bitget, BingX, MEXC, файл и ручные — сначала Binance, потом Bybit, потом OKX (цены крупных бирж почти совпадают;
 *    под графиком честно написано, чьи свечи). BingX из Европы отвечает 403 — поэтому не берём.
 *  - Polymarket (рынок prediction) — графика нет.
 * Нет свечей у первой (монеты нет на бирже, старше хранимой истории) — пробуем следующую.
 */
import { splitPair } from '@/lib/portfolio/fills'
import type { MarketType } from '@/lib/calc/trade'

export type Candle = { t: number; o: number; h: number; l: number; c: number }
export type CandleSource = 'bybit' | 'binance' | 'okx' | 'hyperliquid'
export type Interval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w'

const MIN = 60_000
export const INTERVAL_MS: Record<Interval, number> = { '1m': MIN, '5m': 5 * MIN, '15m': 15 * MIN, '1h': 60 * MIN, '4h': 240 * MIN, '1d': 1440 * MIN, '1w': 10080 * MIN }
export const INTERVALS = Object.keys(INTERVAL_MS) as Interval[]
/** Больше свечей на графике не рисуем: тонкие свечи не читаются, а запросов к бирже больше */
export const MAX_CANDLES = 300

/**
 * Таймфрейм «сам»: самый мелкий, при котором сделка с запасом по краям влезает в MAX_CANDLES свечей
 * и сама сделка занимает хотя бы несколько свечей. Запас — 30 % длины сделки, но не меньше 15 свечей с каждой стороны.
 */
export function autoInterval(entryMs: number, exitMs: number): Interval {
  const dur = Math.max(0, exitMs - entryMs)
  for (const iv of INTERVALS) {
    const ms = INTERVAL_MS[iv]
    const pad = Math.max(dur * 0.3, 15 * ms)
    if ((dur + 2 * pad) / ms <= MAX_CANDLES) return iv
  }
  return '1w'
}

/** Окно графика для таймфрейма: сделка посередине, запас по краям; не дальше «сейчас»; не больше MAX_CANDLES свечей */
export function candleWindow(entryMs: number, exitMs: number, iv: Interval, nowMs = Date.now()): { from: number; to: number } {
  const ms = INTERVAL_MS[iv]
  const dur = Math.max(0, exitMs - entryMs)
  const pad = Math.max(dur * 0.3, 15 * ms)
  let from = Math.floor((entryMs - pad) / ms) * ms
  let to = Math.min(nowMs, Math.ceil((exitMs + pad) / ms) * ms)
  // сделка длиннее, чем влезает в этот таймфрейм, — оставляем конец сделки и всё, что влезает перед ним
  if ((to - from) / ms > MAX_CANDLES) {
    to = Math.min(nowMs, Math.ceil((exitMs + 15 * ms) / ms) * ms)
    from = to - MAX_CANDLES * ms
  }
  return { from, to }
}

/** Какие биржи и с каким кодом пары спрашивать, по порядку */
export function candleSources(exchange: string, symbol: string, market: MarketType): { source: CandleSource; symbol: string }[] {
  if (market === 'prediction') return []
  const s = symbol.toUpperCase().replace(/[-_/]/g, '')
  if (exchange === 'hyperliquid') {
    // HL: «BTCUSDC», биржи-строители — «XYZ-TSLAUSDC» (в базе «:» заменено на «-»)
    const raw = symbol.toUpperCase().replace(/USDC$/, '')
    const dash = raw.indexOf('-')
    const coin = dash > 0 ? `${raw.slice(0, dash).toLowerCase()}:${raw.slice(dash + 1)}` : raw
    const out: { source: CandleSource; symbol: string }[] = [{ source: 'hyperliquid', symbol: coin }]
    if (dash < 0 && /^[A-Z0-9]{1,20}$/.test(raw)) out.push({ source: 'binance', symbol: `${raw}USDT` }, { source: 'bybit', symbol: `${raw}USDT` })
    return out
  }
  if (!/^[A-Z0-9]{2,30}$/.test(s)) return []
  const order: CandleSource[] =
    exchange === 'bybit' ? ['bybit', 'binance', 'okx'] : exchange === 'okx' ? ['okx', 'binance', 'bybit'] : ['binance', 'bybit', 'okx']
  // инверсные (BTCUSD): у Binance это другой адрес (dapi) — берём Bybit
  const list = market === 'inverse' ? order.filter((x) => x !== 'binance') : order
  return list.map((source) => ({ source, symbol: s }))
}

const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : NaN)
function candle(t: unknown, o: unknown, h: unknown, l: unknown, c: unknown): Candle | null {
  const x = { t: num(t), o: num(o), h: num(h), l: num(l), c: num(c) }
  return Object.values(x).every((v) => Number.isFinite(v)) && x.h >= x.l && x.l > 0 ? x : null
}
const sorted = (list: (Candle | null)[], from: number, to: number) => {
  const seen = new Set<number>()
  return list
    .filter((x): x is Candle => x !== null && x.t >= from && x.t < to && !seen.has(x.t) && (seen.add(x.t), true))
    .sort((a, b) => a.t - b.t)
}

type Fetch = typeof fetch
async function getJson(url: string, fetchFn: Fetch, init?: RequestInit): Promise<unknown> {
  const res = await fetchFn(url, init)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

const BYBIT_IV: Record<Interval, string> = { '1m': '1', '5m': '5', '15m': '15', '1h': '60', '4h': '240', '1d': 'D', '1w': 'W' }
const OKX_IV: Record<Interval, string> = { '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1H', '4h': '4H', '1d': '1Dutc', '1w': '1Wutc' }

/** BTCUSDT → BTC-USDT-SWAP (фьючерс) / BTC-USDT (спот) / BTC-USD-SWAP (инверсный) */
export function okxInstId(symbol: string, market: MarketType): string | null {
  const p = splitPair(symbol)
  if (!p) return null
  return market === 'spot' ? `${p.asset}-${p.quote}` : `${p.asset}-${p.quote}-SWAP`
}

export async function fetchCandles(
  source: CandleSource,
  symbol: string,
  market: MarketType,
  iv: Interval,
  from: number,
  to: number,
  fetchFn: Fetch = fetch,
): Promise<Candle[]> {
  const limit = Math.min(1000, Math.ceil((to - from) / INTERVAL_MS[iv]) + 1)
  if (source === 'bybit') {
    const category = market === 'spot' ? 'spot' : market === 'inverse' ? 'inverse' : 'linear'
    const q = new URLSearchParams({ category, symbol, interval: BYBIT_IV[iv], start: String(from), end: String(to), limit: String(limit) })
    const r = (await getJson(`https://api.bybit.com/v5/market/kline?${q}`, fetchFn)) as { retCode?: number; result?: { list?: unknown[][] } }
    if (r.retCode !== 0) throw new Error(`bybit ${r.retCode}`)
    return sorted((r.result?.list ?? []).map((k) => candle(k[0], k[1], k[2], k[3], k[4])), from, to)
  }
  if (source === 'binance') {
    const host = market === 'spot' ? 'https://api.binance.com/api/v3/klines' : 'https://fapi.binance.com/fapi/v1/klines'
    const q = new URLSearchParams({ symbol, interval: iv, startTime: String(from), endTime: String(to - 1), limit: String(limit) })
    const r = (await getJson(`${host}?${q}`, fetchFn)) as unknown[][]
    if (!Array.isArray(r)) throw new Error('binance')
    return sorted(r.map((k) => candle(k[0], k[1], k[2], k[3], k[4])), from, to)
  }
  if (source === 'okx') {
    const inst = okxInstId(symbol, market)
    if (!inst) return []
    // OKX отдаёт по 100 свечей от новых к старым: идём страницами назад от конца окна
    const out: (Candle | null)[] = []
    let after = to
    for (let page = 0; page < 4 && after > from; page++) {
      const q = new URLSearchParams({ instId: inst, bar: OKX_IV[iv], after: String(after), limit: '100' })
      const r = (await getJson(`https://www.okx.com/api/v5/market/history-candles?${q}`, fetchFn)) as { code?: string; data?: unknown[][] }
      if (r.code !== '0') throw new Error(`okx ${r.code}`)
      const rows = r.data ?? []
      if (!rows.length) break
      out.push(...rows.map((k) => candle(k[0], k[1], k[2], k[3], k[4])))
      const oldest = Math.min(...rows.map((k) => num(k[0])))
      if (!Number.isFinite(oldest) || oldest >= after) break
      after = oldest
    }
    return sorted(out, from, to)
  }
  // Hyperliquid: одна просьба, до 5000 последних свечей каждого таймфрейма
  const body = JSON.stringify({ type: 'candleSnapshot', req: { coin: symbol, interval: iv, startTime: from, endTime: to } })
  const r = (await getJson('https://api.hyperliquid.xyz/info', fetchFn, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })) as { t: number; o: string; h: string; l: string; c: string }[]
  if (!Array.isArray(r)) throw new Error('hyperliquid')
  return sorted(r.map((k) => candle(k.t, k.o, k.h, k.l, k.c)), from, to)
}

/**
 * Свечи для сделки: биржи по очереди, пока одна не отдаст свечи, покрывающие сделку.
 * null — ни у одной нет (монета не торгуется, сделка старше истории бирж).
 */
export async function loadTradeCandles(
  t: { exchange: string; symbol: string; market_type: MarketType; entry_at: string; exit_at: string | null },
  iv: Interval,
  nowMs = Date.now(),
  fetchFn: Fetch = fetch,
): Promise<{ source: CandleSource; candles: Candle[]; from: number; to: number } | null> {
  const entry = Date.parse(t.entry_at)
  const exit = t.exit_at ? Date.parse(t.exit_at) : nowMs
  if (!Number.isFinite(entry) || !Number.isFinite(exit)) return null
  const { from, to } = candleWindow(entry, Math.max(entry, exit), iv, nowMs)
  for (const s of candleSources(t.exchange, t.symbol, t.market_type)) {
    try {
      const candles = await fetchCandles(s.source, s.symbol, t.market_type, iv, from, to, fetchFn)
      // свечи должны застать сделку, иначе это не та история (монета появилась позже, переименована)
      const ms = INTERVAL_MS[iv]
      if (candles.length >= 3 && candles[0].t <= Math.max(from, entry) + ms && candles[candles.length - 1].t >= Math.min(exit, to) - 2 * ms) {
        return { source: s.source, candles, from, to }
      }
    } catch {
      /* биржа не ответила или пары нет — следующая */
    }
  }
  return null
}
