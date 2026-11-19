/**
 * Binance USDⓈ-M фьючерсы → сделки. Готовой истории закрытых позиций у Binance нет — собираем позиции из исполнений:
 *  1. движение средств /fapi/v1/income (90 дней): пары, где были комиссии / PnL, и фандинг по парам;
 *  2. исполнения /fapi/v1/userTrades по каждой паре — окнами по 7 дней (так требует Binance);
 *  3. исполнения → позиции: от нуля до нуля (в режиме хеджирования LONG и SHORT — отдельно, переворот в одном исполнении делится).
 * PnL = сумма realizedPnl биржи − комиссии + фандинг за время позиции. Комиссия в BNB в доллары не переводится (0).
 * Курсор — как у Hyperliquid: если позиция ещё открыта, в следующий раз грузим с её первого исполнения.
 */
import { round, type Side } from '@/lib/calc/trade'
import type { ImportedTrade } from '@/lib/import/types'
import { USD_COINS } from '@/lib/import/fields'
import { DAY, ExchangeError, inBatches, num, uidOf, windows, type CexCall, type CexModule, type KeyInfo } from './cex'

export type BinanceFill = {
  id: number
  symbol: string
  side: 'BUY' | 'SELL'
  positionSide?: string // BOTH / LONG / SHORT
  price: string
  qty: string
  realizedPnl: string
  commission: string
  commissionAsset: string
  time: number
}

export type BinanceIncome = { symbol?: string; incomeType: string; income: string; asset?: string; time: number; tranId?: number | string }

function binanceError(r: { code?: number; msg?: string }): ExchangeError {
  const code = Number(r.code)
  const detail = `${code}: ${r.msg ?? ''}`
  if ([-2008, -2014, -2015, -1022].includes(code)) return new ExchangeError('KEY_INVALID', detail)
  if (code === -1003 || code === -1015) return new ExchangeError('RATE_LIMIT', detail)
  if (code === -2011 || code === -1002) return new ExchangeError('KEY_NO_PERMISSION', detail)
  return new ExchangeError('EXCHANGE', detail)
}

export async function binanceGet<T>(call: CexCall, path: string, params: Record<string, string | number>): Promise<T> {
  const r = (await call(path, params)) as unknown
  if (r && typeof r === 'object' && !Array.isArray(r) && typeof (r as { code?: unknown }).code === 'number' && (r as { code: number }).code < 0) {
    throw binanceError(r as { code: number; msg?: string })
  }
  return r as T
}

/** Ключ: включено только «Чтение» (торговля, вывод, переводы, маржа, опционы — выключены) */
export async function checkBinanceKey(call: CexCall): Promise<KeyInfo> {
  const r = await binanceGet<Record<string, unknown>>(call, '/sapi/v1/account/apiRestrictions', {})
  if (!r || r.enableReading !== true) return { readOnly: false }
  const rights = Object.entries(r).filter(([k]) => /^(enable|permits)/.test(k) && k !== 'enableReading')
  // номер аккаунта — из /api/v3/account (в правах ключа его нет); не ответил — без номера, ключ всё равно проверен
  let uid: string | null = null
  try {
    uid = uidOf((await binanceGet<Record<string, unknown>>(call, '/api/v3/account', { omitZeroBalances: 'true' }))?.uid)
  } catch {
    /* без номера */
  }
  return { readOnly: rights.every(([, v]) => v === false), uid }
}

const EPS = 1e-9

type Open = {
  key: string
  symbol: string
  side: Side
  firstId: number
  start: number
  end: number
  openQty: number
  openVal: number
  closeQty: number
  closeVal: number
  fee: number
  realized: number
  pos: number // объём позиции со знаком
}

/** Комиссия в долларах: USDT / USDC — как есть, BNB и прочее — 0 (курса нет) */
const feeUsd = (f: BinanceFill) => (USD_COINS.has(f.commissionAsset?.toUpperCase()) ? Math.abs(num(f.commission) ?? 0) : 0)

/**
 * Исполнения → закрытые позиции и время начала ещё открытых.
 * Исполнения, которые закрывают позицию, открытую до начала периода (realizedPnl ≠ 0 «с нуля»), пропускаем.
 */
export function binanceFillsToTrades(fills: BinanceFill[], funding: BinanceIncome[] = []): { trades: ImportedTrade[]; openStarts: number[] } {
  const groups = new Map<string, BinanceFill[]>()
  for (const f of fills) {
    const key = `${f.symbol}|${f.positionSide ?? 'BOTH'}`
    groups.set(key, [...(groups.get(key) ?? []), f])
  }
  const trades: ImportedTrade[] = []
  const openStarts: number[] = []

  const finish = (o: Open) => {
    if (o.openQty <= EPS || o.closeQty <= EPS) return
    const entry = o.openVal / o.openQty
    const exit = o.closeVal / o.closeQty
    const fund = funding
      .filter((x) => x.symbol === o.symbol && x.incomeType === 'FUNDING_FEE' && x.time >= o.start && x.time <= o.end)
      .reduce((s, x) => s + (num(x.income) ?? 0), 0)
    trades.push({
      exchange: 'binance',
      market_type: 'linear',
      symbol: o.symbol,
      side: o.side,
      entry_at: new Date(o.start).toISOString(),
      exit_at: new Date(o.end).toISOString(),
      entry_price: round(entry, 10),
      exit_price: round(exit, 10),
      size_usd: round(o.openVal, 8),
      leverage: 1, // плечо Binance в исполнениях не отдаёт
      fee: round(o.fee, 8),
      funding: round(fund, 8),
      pnl: round(o.realized - o.fee + fund, 8),
      pnl_manual: false,
      external_id: `bn:${o.key}:${o.firstId}`,
    })
  }

  for (const [key, list] of groups) {
    list.sort((a, b) => a.time - b.time || a.id - b.id)
    let cur: Open | null = null
    let started = false
    const forced = key.endsWith('|LONG') ? 1 : key.endsWith('|SHORT') ? -1 : 0
    for (const f of list) {
      const qty = num(f.qty) ?? 0
      const price = num(f.price) ?? 0
      if (qty <= 0 || price <= 0) continue
      const sign = f.side === 'BUY' ? 1 : -1
      const fee = feeUsd(f)
      const pnl = num(f.realizedPnl) ?? 0
      if (!cur) {
        // «с нуля» закрывающее исполнение — хвост позиции, открытой до начала периода
        if (!started && pnl !== 0) continue
        // режим хеджирования: LONG открывается покупкой, SHORT — продажей
        if (forced && sign !== forced) continue
        started = true
        cur = { key, symbol: f.symbol, side: sign > 0 ? 'long' : 'short', firstId: f.id, start: f.time, end: f.time, openQty: 0, openVal: 0, closeQty: 0, closeVal: 0, fee: 0, realized: 0, pos: 0 }
      }
      cur.end = f.time
      const dirSign: number = cur.side === 'long' ? 1 : -1
      if (sign === dirSign) {
        cur.openQty += qty
        cur.openVal += qty * price
        cur.fee += fee
        cur.pos += sign * qty
        continue
      }
      // уменьшение позиции; остаток сверх позиции — переворот (только в одностороннем режиме)
      const closing = Math.min(qty, Math.abs(cur.pos))
      const share = closing / qty
      cur.closeQty += closing
      cur.closeVal += closing * price
      cur.fee += fee * share
      cur.realized += pnl
      cur.pos += sign * closing
      if (Math.abs(cur.pos) <= EPS * Math.max(1, cur.openQty)) {
        finish(cur)
        const rest = qty - closing
        cur = null
        if (rest > EPS * qty && key.endsWith('|BOTH')) {
          cur = { key, symbol: f.symbol, side: sign > 0 ? 'long' : 'short', firstId: f.id, start: f.time, end: f.time, openQty: rest, openVal: rest * price, closeQty: 0, closeVal: 0, fee: fee * (1 - share), realized: 0, pos: sign * rest }
        }
      }
    }
    if (cur) openStarts.push(cur.start)
  }
  return { trades, openStarts }
}

const TRADES_WINDOW = 7 * DAY
const INCOME_WINDOW = 7 * DAY

/** Движение средств с from по to: окна по 7 дней, по 1000 записей (полная страница — продолжаем с её последнего времени) */
export async function fetchBinanceIncome(call: CexCall, from: number, to: number): Promise<BinanceIncome[]> {
  const out = new Map<string, BinanceIncome>()
  await inBatches(windows(from, to, INCOME_WINDOW), 3, async ([s, e]) => {
    let start = s
    for (let page = 0; page < 20; page++) {
      const rows = await binanceGet<BinanceIncome[]>(call, '/fapi/v1/income', { startTime: start, endTime: e, limit: 1000 })
      const list = Array.isArray(rows) ? rows : []
      for (const r of list) out.set(`${r.incomeType}:${r.tranId ?? ''}:${r.symbol ?? ''}:${r.time}:${r.income}`, r)
      if (list.length < 1000) break
      const last = Math.max(...list.map((r) => r.time))
      if (last <= start) break
      start = last
    }
  })
  return [...out.values()]
}

/** Исполнения пары с from по to: окна по 7 дней; полная страница — дальше по fromId */
export async function fetchBinanceFills(call: CexCall, symbol: string, from: number, to: number): Promise<BinanceFill[]> {
  const out = new Map<number, BinanceFill>()
  for (const [s, e] of windows(from, to, TRADES_WINDOW)) {
    let list = await binanceGet<BinanceFill[]>(call, '/fapi/v1/userTrades', { symbol, startTime: s, endTime: e, limit: 1000 })
    for (let page = 0; page < 20 && Array.isArray(list); page++) {
      for (const f of list) if (f.time <= e) out.set(f.id, f)
      if (list.length < 1000 || list.some((f) => f.time > e)) break
      list = await binanceGet<BinanceFill[]>(call, '/fapi/v1/userTrades', { symbol, fromId: Math.max(...list.map((f) => f.id)) + 1, limit: 1000 })
    }
  }
  return [...out.values()]
}

export async function fetchBinanceTrades(call: CexCall, from: number, to: number): Promise<{ trades: ImportedTrade[]; cursor: number | null }> {
  const income = await fetchBinanceIncome(call, from, to)
  // пары с комиссиями (любое исполнение) или PnL — в них есть сделки, в том числе ещё открытые
  const symbols = [...new Set(income.filter((r) => r.symbol && (r.incomeType === 'COMMISSION' || r.incomeType === 'REALIZED_PNL')).map((r) => r.symbol as string))].sort()
  const fills: BinanceFill[] = []
  await inBatches(symbols, 3, async (symbol) => {
    fills.push(...(await fetchBinanceFills(call, symbol, from, to)))
  })
  const { trades, openStarts } = binanceFillsToTrades(fills, income)
  const lastFill = fills.length ? Math.max(...fills.map((f) => f.time)) + 1 : to
  return { trades, cursor: openStarts.length ? Math.min(...openStarts) : Math.min(lastFill, to) }
}

export const binanceModule: CexModule = {
  historyDays: 90, // столько хранит движение средств (income)
  overlapMs: 0, // курсор стоит там, где все позиции были закрыты
  check: checkBinanceKey,
  fetch: fetchBinanceTrades,
}
