/**
 * BingX (бессрочные USDT / USDC) → сделки. Источник — /openApi/swap/v2/trade/positionHistory (закрытые позиции).
 * BingX отдаёт историю только по одной паре — список пар берём из движения средств (/openApi/swap/v2/user/income,
 * записи REALIZED_PNL: пара, в которой что-то закрывалось). Глубина — 90 дней.
 */
import { round, type Side } from '@/lib/calc/trade'
import type { ImportedTrade } from '@/lib/import/types'
import { DAY, ExchangeError, clampLeverage, inBatches, num, plainSymbol, windows, type CexCall, type CexModule, type KeyInfo } from './cex'

export type BingxPosition = {
  positionId: string
  symbol: string // BTC-USDT
  positionSide: string // LONG / SHORT
  openTime: number | string
  updateTime: number | string
  avgPrice: string
  avgClosePrice: string
  realisedProfit?: string
  realizedProfit?: string // так в документации; в ответах API — realisedProfit
  netProfit: string
  positionAmt?: string
  closePositionAmt?: string
  leverage?: number | string
  closeAllPositions?: boolean
  positionCommission?: string
  totalFunding?: string
}

type BingxReply<T> = { code: number; msg?: string; data?: T }

function bingxError(r: { code?: number; msg?: string } | null): ExchangeError {
  const code = Number(r?.code ?? -1)
  const detail = `${code}: ${r?.msg ?? ''}`
  if ([100001, 100412, 100413, 100421].includes(code)) return new ExchangeError('KEY_INVALID', detail)
  if (code === 100419) return new ExchangeError('KEY_IP', detail)
  if (code === 100004) return new ExchangeError('KEY_NO_PERMISSION', detail)
  if (code === 100410 || code === 109400) return new ExchangeError('RATE_LIMIT', detail)
  return new ExchangeError('EXCHANGE', detail)
}

export async function bingxGet<T>(call: CexCall, path: string, params: Record<string, string | number>): Promise<T> {
  const r = (await call(path, params)) as BingxReply<T> | null
  if (!r || (r.code !== undefined && r.code !== 0)) throw bingxError(r)
  return (r.data ?? r) as T
}

/**
 * Одна закрытая позиция → сделка. Количество монет считаем из валового PnL и цен:
 * поле positionAmt у BingX бывает в контрактах, а realisedProfit = (выход − вход) × количество — точно.
 */
export function bingxPositionToTrade(p: BingxPosition): ImportedTrade | null {
  if (p.closeAllPositions === false) return null
  const entry = num(p.avgPrice)
  const exit = num(p.avgClosePrice)
  const gross = num(p.realisedProfit ?? p.realizedProfit)
  const net = num(p.netProfit)
  const opened = num(p.openTime)
  const closed = num(p.updateTime)
  if (!entry || !exit || entry <= 0 || exit <= 0 || gross === null || net === null || !closed) return null
  const side: Side = String(p.positionSide).toUpperCase() === 'SHORT' ? 'short' : 'long'
  const move = side === 'long' ? exit - entry : entry - exit
  const qty = Math.abs(move) / entry > 1e-7 && gross !== 0 ? gross / move : num(p.closePositionAmt ?? p.positionAmt)
  if (!qty || qty <= 0) return null
  return {
    exchange: 'bingx',
    market_type: 'linear',
    symbol: plainSymbol(p.symbol),
    side,
    entry_at: new Date(opened ?? closed).toISOString(),
    exit_at: new Date(closed).toISOString(),
    entry_price: entry,
    exit_price: exit,
    size_usd: round(qty * entry, 8),
    leverage: clampLeverage(num(p.leverage)),
    fee: round(Math.abs(num(p.positionCommission) ?? 0), 8),
    funding: round(num(p.totalFunding) ?? 0, 8),
    pnl: round(net, 8),
    pnl_manual: false,
    external_id: `bx:${p.positionId}`,
  }
}

/** Ключ: только право «Чтение» (2). 1 — спот, 3 — фьючерсы, 4 — переводы, 5 — вывод, 7 — переводы субаккаунтов */
export async function checkBingxKey(call: CexCall): Promise<KeyInfo> {
  const d = await bingxGet<{ permissions?: number[] }>(call, '/openApi/v1/account/apiPermissions', {})
  const perms = (d?.permissions ?? []).map(Number)
  return { readOnly: perms.length > 0 && perms.every((p) => p === 2) }
}

const INCOME_WINDOW = 7 * DAY
const HISTORY_WINDOW = 90 * DAY
const PAGE = 100

/** Пары, в которых с from по to что-то закрывалось (USDT- и USDC-контракты) */
export async function bingxSymbols(call: CexCall, from: number, to: number): Promise<string[]> {
  const found = new Set<string>()
  const jobs = (['USDT', 'USDC'] as const).flatMap((currency) => windows(from, to, INCOME_WINDOW).map((w) => ({ currency, w })))
  await inBatches(jobs, 3, async ({ currency, w }) => {
    const rows = await bingxGet<{ symbol?: string }[]>(call, '/openApi/swap/v2/user/income', {
      currency,
      incomeType: 'REALIZED_PNL',
      startTime: w[0],
      endTime: w[1],
      limit: 1000,
    })
    for (const r of Array.isArray(rows) ? rows : []) if (r.symbol) found.add(r.symbol)
  })
  return [...found].sort()
}

export async function fetchBingxTrades(call: CexCall, from: number, to: number): Promise<ImportedTrade[]> {
  const symbols = await bingxSymbols(call, from, to)
  const out = new Map<string, ImportedTrade>()
  const seen = new Set<string>()
  const jobs = symbols.flatMap((symbol) => windows(from, to, HISTORY_WINDOW).map((w) => ({ symbol, w })))
  await inBatches(jobs, 3, async ({ symbol, w }) => {
    for (let pageIndex = 0; pageIndex < 50; pageIndex++) {
      const d = await bingxGet<{ positionHistory?: BingxPosition[] } | BingxPosition[]>(call, '/openApi/swap/v2/trade/positionHistory', {
        symbol,
        currency: symbol.endsWith('-USDC') ? 'USDC' : 'USDT',
        startTime: w[0],
        endTime: w[1],
        pageIndex,
        pageSize: PAGE,
      })
      const list = Array.isArray(d) ? d : (d?.positionHistory ?? [])
      let fresh = 0
      for (const p of list) {
        if (seen.has(p.positionId)) continue
        seen.add(p.positionId)
        fresh++
        const t = bingxPositionToTrade(p)
        if (t) out.set(t.external_id, t)
      }
      // страница неполная или ничего нового (биржа повторила страницу) — дальше нет
      if (list.length < PAGE || fresh === 0) break
    }
  })
  return [...out.values()]
}

export const bingxModule: CexModule = {
  historyDays: 90,
  overlapMs: 2 * DAY,
  check: checkBingxKey,
  fetch: async (call, from, to) => ({ trades: await fetchBingxTrades(call, from, to), cursor: to }),
}
