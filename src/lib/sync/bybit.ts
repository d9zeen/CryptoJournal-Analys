/**
 * Bybit API v5 → сделки. Источник — /v5/position/closed-pnl (закрытые позиции, как отчёт «Закрытый P&L»):
 * одна запись = одна закрытая позиция с ценами входа / выхода и PnL от биржи (уже за вычетом комиссий и фандинга).
 * Запросы подписывает серверная функция exchange-proxy (секрет в браузер не попадает).
 */
import { grossPnl, round, type MarketType, type Side } from '@/lib/calc/trade'
import { normalizeSymbol } from '@/lib/import/fields'
import type { ImportedTrade } from '@/lib/import/types'

export type BybitClosedPnl = {
  symbol: string
  orderId: string
  side: string // закрывающий ордер: Sell закрыл лонг
  closedSize: string
  cumEntryValue: string
  avgEntryPrice: string
  cumExitValue: string
  avgExitPrice: string
  closedPnl: string
  leverage: string
  createdTime: string
  updatedTime: string
  openFee?: string
  closeFee?: string
}

export type BybitCategory = 'linear' | 'inverse'

/** Ответ Bybit: retCode 0 — успех */
export type BybitResponse<T> = { retCode: number; retMsg: string; result: T }

const num = (s: string | undefined) => (s === undefined || s === '' ? null : Number(s))

/** Одна закрытая позиция Bybit → сделка для дневника (null — если данные неполные) */
export function bybitClosedToTrade(item: BybitClosedPnl, category: BybitCategory): ImportedTrade | null {
  const symbol = normalizeSymbol(item.symbol)
  const entry = num(item.avgEntryPrice)
  const exit = num(item.avgExitPrice)
  const pnlRaw = num(item.closedPnl)
  const time = num(item.updatedTime) ?? num(item.createdTime)
  if (!symbol || !entry || !exit || entry <= 0 || exit <= 0 || pnlRaw === null || !time) return null
  const side: Side = item.side === 'Sell' ? 'long' : 'short'
  const market: MarketType = category
  // linear: стоимость входа в USDT; inverse: размер в контрактах по 1 $, PnL и комиссии — в монете
  const size = market === 'inverse' ? num(item.closedSize) : num(item.cumEntryValue)
  if (!size || size <= 0) return null
  const toUsd = (v: number) => (market === 'inverse' ? v * exit : v)
  const pnl = round(toUsd(pnlRaw), 8)
  const gross = grossPnl({ marketType: market, side, entryPrice: entry, exitPrice: exit, sizeUsd: size }) ?? 0

  // комиссии: если Bybit отдал их отдельно — остаток до PnL это фандинг; иначе вся разница — комиссии
  let fee: number
  let funding: number
  const openFee = num(item.openFee)
  const closeFee = num(item.closeFee)
  if (openFee !== null && closeFee !== null) {
    fee = round(toUsd(Math.abs(openFee) + Math.abs(closeFee)), 8)
    funding = round(pnl - (gross - fee), 8)
  } else {
    const diff = round(gross - pnl, 8)
    fee = diff > 0 ? diff : 0
    funding = diff > 0 ? 0 : -diff
  }
  const at = new Date(time).toISOString()
  const lev = num(item.leverage) ?? 1
  return {
    exchange: 'bybit',
    market_type: market,
    symbol,
    side,
    entry_at: at, // время открытия Bybit в closed-pnl не отдаёт
    exit_at: at,
    entry_price: entry,
    exit_price: exit,
    size_usd: round(size, 8),
    leverage: Math.min(1000, Math.max(1, lev)),
    fee,
    funding,
    pnl,
    pnl_manual: false,
    external_id: `o:${item.orderId}`, // как в файле «Закрытый P&L» — повторно не загрузится
  }
}

export const DAY = 86_400_000
const WINDOW = 7 * DAY // Bybit отдаёт closed-pnl окнами не больше 7 дней
/** Первая синхронизация — за 2 года (столько хранит Bybit) */
export const BYBIT_HISTORY_DAYS = 730

export type BybitCall = (path: string, params: Record<string, string | number>) => Promise<BybitResponse<unknown>>

export class BybitError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(message)
  }
}

/** Все закрытые позиции с from по to (мс): окна по 7 дней, страницы по 100, linear и inverse */
export async function fetchBybitTrades(call: BybitCall, from: number, to: number, onProgress?: (done: number, total: number) => void): Promise<ImportedTrade[]> {
  const windows: [number, number][] = []
  for (let s = from; s < to; s += WINDOW) windows.push([s, Math.min(s + WINDOW - 1, to)])
  const jobs = (['linear', 'inverse'] as const).flatMap((category) => windows.map((w) => ({ category, w })))
  const out: ImportedTrade[] = []
  let done = 0
  const PARALLEL = 4
  for (let i = 0; i < jobs.length; i += PARALLEL) {
    await Promise.all(
      jobs.slice(i, i + PARALLEL).map(async ({ category, w }) => {
        let cursor = ''
        for (let page = 0; page < 50; page++) {
          const res = await call('/v5/position/closed-pnl', { category, startTime: w[0], endTime: w[1], limit: 100, ...(cursor ? { cursor } : {}) })
          if (res.retCode !== 0) throw new BybitError(res.retCode, res.retMsg)
          const r = res.result as { list?: BybitClosedPnl[]; nextPageCursor?: string }
          for (const item of r.list ?? []) {
            const t = bybitClosedToTrade(item, category)
            if (t) out.push(t)
          }
          cursor = r.nextPageCursor ?? ''
          if (!cursor || !(r.list ?? []).length) break
        }
        onProgress?.(++done, jobs.length)
      }),
    )
  }
  return out
}

/** Проверка ключа: только чтение. Возвращает дату окончания ключа (Bybit: без привязки к IP — 90 дней) */
export async function checkBybitKey(call: BybitCall): Promise<{ readOnly: boolean; expiresAt: string | null }> {
  const res = await call('/v5/user/query-api', {})
  if (res.retCode !== 0) throw new BybitError(res.retCode, res.retMsg)
  const r = res.result as { readOnly?: number; expiredAt?: string }
  return { readOnly: r.readOnly === 1, expiresAt: r.expiredAt || null }
}
