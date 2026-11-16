/**
 * Bitget → сделки. Источник — история закрытых позиций (последние 90 дней):
 *  - единый торговый аккаунт (UTA): /api/v3/position/history-position (окна до 30 дней, страницы по cursor);
 *  - классический аккаунт: /api/v2/mix/position/history-position (страницы по idLessThan).
 * Какой аккаунт — узнаём по /api/v3/account/settings (у классического он отвечает ошибкой).
 * Одна запись = одна закрытая позиция: цены входа / выхода, размер в монете, чистый результат, комиссии и фандинг.
 */
import { round, type MarketType, type Side } from '@/lib/calc/trade'
import type { ImportedTrade } from '@/lib/import/types'
import { DAY, ExchangeError, clampLeverage, num, plainSymbol, windows, type CexCall, type CexModule, type KeyInfo } from './cex'

/** Запись истории: поля UTA (v3) и классического аккаунта (v2) */
export type BitgetPosition = {
  positionId?: string
  symbol: string
  // v3
  posSide?: string
  openPriceAvg?: string
  closePriceAvg?: string
  openFeeTotal?: string
  closeFeeTotal?: string
  createdTime?: string
  updatedTime?: string
  // v2
  holdSide?: string
  openAvgPrice?: string
  closeAvgPrice?: string
  openFee?: string
  closeFee?: string
  ctime?: string
  utime?: string
  // общие
  closeTotalPos: string
  netProfit: string
  totalFunding?: string
  leverage?: string
}

type BitgetReply<T> = { code: string; msg: string; data?: T }

function bitgetError(r: { code?: string; msg?: string } | null): ExchangeError {
  const code = String(r?.code ?? '')
  const detail = `${code}: ${r?.msg ?? ''}`
  if (['40006', '40009', '40011', '40012', '40037'].includes(code)) return new ExchangeError('KEY_INVALID', detail)
  if (code === '40018') return new ExchangeError('KEY_IP', detail)
  if (code === '40014' || code === '40022') return new ExchangeError('KEY_NO_PERMISSION', detail)
  if (code === '429' || code === '43001') return new ExchangeError('RATE_LIMIT', detail)
  return new ExchangeError('EXCHANGE', detail)
}

export async function bitgetGet<T>(call: CexCall, path: string, params: Record<string, string | number>): Promise<T> {
  const r = (await call(path, params)) as BitgetReply<T> | null
  if (!r || r.code !== '00000') throw bitgetError(r)
  return r.data as T
}

/** Фьючерсы: USDT, USDC и монетные (COIN-M — инверсные) */
const PRODUCTS = ['USDT-FUTURES', 'USDC-FUTURES', 'COIN-FUTURES'] as const
type Product = (typeof PRODUCTS)[number]

/** Одна закрытая позиция Bitget → сделка (null — неполная запись) */
export function bitgetPositionToTrade(p: BitgetPosition, product: Product): ImportedTrade | null {
  const entry = num(p.openPriceAvg ?? p.openAvgPrice)
  const exit = num(p.closePriceAvg ?? p.closeAvgPrice)
  const qty = num(p.closeTotalPos)
  const net = num(p.netProfit)
  const opened = num(p.createdTime ?? p.ctime)
  const closed = num(p.updatedTime ?? p.utime)
  if (!entry || !exit || entry <= 0 || exit <= 0 || !qty || qty <= 0 || net === null || !closed) return null
  const market: MarketType = product === 'COIN-FUTURES' ? 'inverse' : 'linear'
  const side: Side = (p.posSide ?? p.holdSide) === 'short' ? 'short' : 'long'
  // размер — в монете; у монетных контрактов PnL и комиссии тоже в монете
  const toUsd = (v: number) => (market === 'inverse' ? v * exit : v)
  const fee = Math.abs(num(p.openFeeTotal ?? p.openFee) ?? 0) + Math.abs(num(p.closeFeeTotal ?? p.closeFee) ?? 0)
  const at = opened ?? closed
  return {
    exchange: 'bitget',
    market_type: market,
    symbol: plainSymbol(p.symbol),
    side,
    entry_at: new Date(at).toISOString(),
    exit_at: new Date(closed).toISOString(),
    entry_price: entry,
    exit_price: exit,
    size_usd: round(qty * entry, 8),
    leverage: clampLeverage(num(p.leverage)),
    fee: round(toUsd(fee), 8),
    funding: round(toUsd(num(p.totalFunding) ?? 0), 8),
    pnl: round(toUsd(net), 8),
    pnl_manual: false,
    // один и тот же id для обоих видов аккаунта: после перехода на UTA старые позиции не задвоятся
    external_id: `bg:${p.symbol}:${side}:${at}`,
  }
}

/**
 * Ключ: «только чтение».
 *  - единый аккаунт (UTA): /api/v3/account/info → permType = read-only;
 *  - классический: /api/v2/spot/account/info → authorities (права ключа, например ["readonly"] или ["trade", "readonly"]):
 *    любое право на торговлю / перевод / вывод — отказ, как у остальных бирж (дыра №1 из плана портфеля, 16.11.2026).
 *    Если Bitget не прислал список прав вовсе — ключ принимаем, проверив, что он рабочий: сайт всё равно ходит к Bitget
 *    только по адресам для чтения (список в exchange-proxy).
 */
const WRITE_RIGHT = /trade|transfer|withdraw|write|order/i
export async function checkBitgetKey(call: CexCall): Promise<KeyInfo> {
  const r = (await call('/api/v3/account/info', {})) as BitgetReply<{ permType?: string }> | null
  if (r?.code === '00000') return { readOnly: r.data?.permType === 'read-only' }
  const err = bitgetError(r)
  if (err.kind !== 'EXCHANGE') throw err // неверный ключ, IP, частота — сразу
  // классический аккаунт: права ключа из информации о споте
  const info = (await call('/api/v2/spot/account/info', {})) as BitgetReply<{ authorities?: unknown }> | null
  if (info?.code === '00000' && Array.isArray(info.data?.authorities)) {
    const rights = info.data.authorities.map(String)
    return { readOnly: rights.length > 0 && !rights.some((a) => WRITE_RIGHT.test(a)) }
  }
  // прав не прислали: проверяем, что ключ вообще работает
  await bitgetGet(call, '/api/v2/mix/position/history-position', { productType: 'USDT-FUTURES', limit: 1 })
  return { readOnly: true }
}

const PAGE = 100
const WINDOW = 30 * DAY

async function isUta(call: CexCall): Promise<boolean> {
  const r = (await call('/api/v3/account/settings', {})) as BitgetReply<unknown> | null
  if (r?.code === '00000') return true
  const err = bitgetError(r)
  if (err.kind !== 'EXCHANGE') throw err
  return false
}

export async function fetchBitgetTrades(call: CexCall, from: number, to: number): Promise<ImportedTrade[]> {
  const uta = await isUta(call)
  const out: ImportedTrade[] = []
  for (const product of PRODUCTS) {
    for (const [s, e] of windows(from, to, WINDOW)) {
      let cursor = ''
      for (let page = 0; page < 100; page++) {
        const base = { startTime: s, endTime: e, limit: PAGE }
        const data = uta
          ? await bitgetGet<{ list?: BitgetPosition[]; cursor?: string }>(call, '/api/v3/position/history-position', { ...base, category: product, ...(cursor ? { cursor } : {}) })
          : await bitgetGet<{ list?: BitgetPosition[]; endId?: string }>(call, '/api/v2/mix/position/history-position', { ...base, productType: product, ...(cursor ? { idLessThan: cursor } : {}) })
        const list = data?.list ?? []
        for (const p of list) {
          const t = bitgetPositionToTrade(p, product)
          if (t) out.push(t)
        }
        const next = (uta ? (data as { cursor?: string }).cursor : (data as { endId?: string }).endId) ?? ''
        if (list.length < PAGE || !next || next === cursor) break
        cursor = next
      }
    }
  }
  return out
}

export const bitgetModule: CexModule = {
  historyDays: 90,
  overlapMs: 2 * DAY,
  check: checkBitgetKey,
  fetch: async (call, from, to) => ({ trades: await fetchBitgetTrades(call, from, to), cursor: to }),
}
