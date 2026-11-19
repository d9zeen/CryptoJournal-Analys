/**
 * Общее для бирж с ключом API (BingX, OKX, Bitget, Binance; Bybit — свой модуль bybit.ts).
 * Модуль биржи получает `call` — подписанный запрос «только чтение» (в браузере — через exchange-proxy, на сервере — напрямую)
 * и отдаёт закрытые сделки. Ошибки биржи — ExchangeError с понятным кодом (тексты — connections.errors в i18n).
 */
import type { ImportedTrade } from '@/lib/import/types'

/** Подписанный GET к бирже; ответ — JSON биржи как есть (в том числе с ошибкой) */
export type CexCall = (path: string, params: Record<string, string | number>) => Promise<unknown>

export type ExchangeErrorKind = 'KEY_INVALID' | 'KEY_NO_PERMISSION' | 'KEY_IP' | 'RATE_LIMIT' | 'EXCHANGE'

export class ExchangeError extends Error {
  constructor(
    public kind: ExchangeErrorKind,
    public detail: string,
  ) {
    super(detail)
  }
}

/** uid — номер аккаунта на бирже: один аккаунт — одно подключение (0025; нет у биржи такого — не передаём) */
export type KeyInfo = { readOnly: boolean; expiresAt?: string | null; uid?: string | null }

export type CexModule = {
  /** первая синхронизация — за столько дней (сколько хранит биржа) */
  historyDays: number
  /** следующая синхронизация — с запасом назад от прошлой (биржа может отдать закрытие позже) */
  overlapMs: number
  /** ключ рабочий и только для чтения */
  check: (call: CexCall) => Promise<KeyInfo>
  /** закрытые сделки с from по to (мс) и с какого места продолжить (null — с того же) */
  fetch: (call: CexCall, from: number, to: number) => Promise<{ trades: ImportedTrade[]; cursor: number | null }>
}

export const DAY = 86_400_000

/** Номер аккаунта биржи → строка (0 / пусто / мусор — null) */
export const uidOf = (v: unknown): string | null => {
  const s = typeof v === 'number' || typeof v === 'string' ? String(v).trim() : ''
  return s && s !== '0' && s.length <= 64 ? s : null
}

/** Число из строки биржи; пусто / мусор — null */
export const num = (v: unknown): number | null => {
  if (v === undefined || v === null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Отрезок [from, to] → окна не длиннее size */
export function windows(from: number, to: number, size: number): [number, number][] {
  const out: [number, number][] = []
  for (let s = from; s < to; s += size) out.push([s, Math.min(s + size - 1, to)])
  return out
}

/** Задачи по `parallel` одновременно (биржи ограничивают число запросов в секунду) */
export async function inBatches<T>(items: T[], parallel: number, fn: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += parallel) await Promise.all(items.slice(i, i + parallel).map(fn))
}

/** BTC-USDT, BTC-USDT-SWAP, BTC_USDT → BTCUSDT (как у Bybit) */
export const plainSymbol = (s: string) =>
  s
    .toUpperCase()
    .replace(/-SWAP$/, '')
    .replace(/[-_/]/g, '')

export const clampLeverage = (v: number | null) => Math.min(1000, Math.max(1, v && v > 0 ? v : 1))
