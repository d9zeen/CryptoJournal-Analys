/**
 * OKX API v5 → сделки. Источник — /api/v5/account/positions-history (закрытые позиции за 3 месяца):
 * одна запись = одна позиция с ценами входа / выхода, PnL, комиссиями и фандингом от биржи.
 * Размер — в контрактах: стоимость контракта (ctVal) берём из списка инструментов (/api/v5/public/instruments).
 * Только бессрочные контракты (SWAP). Регион ключа (общий, Европа, США) подбирает подпись (callExchange).
 */
import { round, type MarketType, type Side } from '@/lib/calc/trade'
import type { ImportedTrade } from '@/lib/import/types'
import { DAY, ExchangeError, clampLeverage, num, plainSymbol, type CexCall, type CexModule, type KeyInfo } from './cex'

export type OkxPosition = {
  instId: string // BTC-USDT-SWAP
  posId: string
  direction: string // long / short
  type: string // 1 — частично, 2 — полностью, 3 — ликвидация, 4 — частичная ликвидация, 5 — ADL
  openAvgPx: string
  closeAvgPx: string
  closeTotalPos: string // в контрактах
  realizedPnl: string // = pnl + fee + fundingFee + liqPenalty
  fee: string // отрицательная — заплачено
  fundingFee: string
  liqPenalty?: string
  lever: string
  cTime: string
  uTime: string
}

export type OkxInstrument = { instId: string; ctVal: string; ctType: string }

type OkxReply<T> = { code: string; msg: string; data?: T[] }

function okxError(r: { code?: string; msg?: string } | null): ExchangeError {
  const code = String(r?.code ?? '')
  const detail = `${code}: ${r?.msg ?? ''}`
  if (['50100', '50101', '50105', '50111', '50113', '50119'].includes(code)) return new ExchangeError('KEY_INVALID', detail)
  if (code === '50110') return new ExchangeError('KEY_IP', detail)
  if (code === '50120' || code === '50030') return new ExchangeError('KEY_NO_PERMISSION', detail)
  if (code === '50011' || code === '50061') return new ExchangeError('RATE_LIMIT', detail)
  return new ExchangeError('EXCHANGE', detail)
}

async function okxGet<T>(call: CexCall, path: string, params: Record<string, string | number>): Promise<T[]> {
  const r = (await call(path, params)) as OkxReply<T> | null
  if (!r || r.code !== '0') throw okxError(r)
  return r.data ?? []
}

/** Полностью закрытые (в том числе ликвидацией и ADL); частичные закрытия придут позже — целой позицией */
const FULL = new Set(['2', '3', '5'])

/** Одна закрытая позиция OKX → сделка (null — неполная запись или неизвестный инструмент) */
export function okxPositionToTrade(p: OkxPosition, inst: OkxInstrument | undefined): ImportedTrade | null {
  if (!inst || !FULL.has(p.type)) return null
  const entry = num(p.openAvgPx)
  const exit = num(p.closeAvgPx)
  const contracts = num(p.closeTotalPos)
  const ctVal = num(inst.ctVal)
  const pnlRaw = num(p.realizedPnl)
  const opened = num(p.cTime)
  const closed = num(p.uTime)
  if (!entry || !exit || entry <= 0 || exit <= 0 || !contracts || contracts <= 0 || !ctVal || pnlRaw === null || !closed) return null
  const market: MarketType = inst.ctType === 'inverse' ? 'inverse' : 'linear'
  const side: Side = p.direction === 'short' ? 'short' : 'long'
  // linear: контракт = ctVal монет, PnL в USDT / USDC; inverse: контракт = ctVal долларов, PnL в монете
  const size = market === 'inverse' ? contracts * ctVal : contracts * ctVal * entry
  const toUsd = (v: number) => (market === 'inverse' ? v * exit : v)
  return {
    exchange: 'okx',
    market_type: market,
    symbol: plainSymbol(p.instId),
    side,
    entry_at: new Date(opened ?? closed).toISOString(),
    exit_at: new Date(closed).toISOString(),
    entry_price: entry,
    exit_price: exit,
    size_usd: round(size, 8),
    leverage: clampLeverage(num(p.lever)),
    fee: round(toUsd(Math.abs(num(p.fee) ?? 0) + Math.abs(num(p.liqPenalty) ?? 0)), 8),
    funding: round(toUsd(num(p.fundingFee) ?? 0), 8),
    pnl: round(toUsd(pnlRaw), 8),
    pnl_manual: false,
    external_id: `okx:${p.posId}:${p.cTime}`,
  }
}

/** Ключ: права только «Чтение» (perm = read_only; trade / withdraw — отказ) */
export async function checkOkxKey(call: CexCall): Promise<KeyInfo> {
  const [cfg] = await okxGet<{ perm?: string }>(call, '/api/v5/account/config', {})
  const perms = (cfg?.perm ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  return { readOnly: perms.length > 0 && perms.every((p) => p === 'read_only') }
}

const PAGE = 100

/** Закрытые позиции с from по to: страницы по 100 от новых к старым (after = uTime последней) */
export async function fetchOkxTrades(call: CexCall, from: number, to: number): Promise<ImportedTrade[]> {
  const instruments = new Map((await okxGet<OkxInstrument>(call, '/api/v5/public/instruments', { instType: 'SWAP' })).map((i) => [i.instId, i]))
  const out: ImportedTrade[] = []
  let after = String(to)
  for (let page = 0; page < 200; page++) {
    const list = await okxGet<OkxPosition>(call, '/api/v5/account/positions-history', { instType: 'SWAP', limit: PAGE, after })
    for (const p of list) {
      const t = (num(p.uTime) ?? 0) >= from ? okxPositionToTrade(p, instruments.get(p.instId)) : null
      if (t) out.push(t)
    }
    const oldest = Math.min(...list.map((p) => num(p.uTime) ?? Infinity))
    if (list.length < PAGE || !Number.isFinite(oldest) || oldest < from || String(oldest) === after) break
    after = String(oldest)
  }
  return out
}

export const okxModule: CexModule = {
  historyDays: 90,
  overlapMs: 2 * DAY,
  check: checkOkxKey,
  fetch: async (call, from, to) => ({ trades: await fetchOkxTrades(call, from, to), cursor: to }),
}
