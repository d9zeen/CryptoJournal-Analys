/**
 * Биржи для импорта. Все работают через один движок (universal.ts) — отличаются только тем,
 * как понимать Buy/Sell в выгрузке закрытых позиций. Новая биржа = строка ниже + подсказка
 * «где взять файл» в i18n (import.howTo).
 */
import { makeParser } from './universal'
import type { ImportParser } from './types'

export const IMPORT_PARSERS: ImportParser[] = [
  makeParser('bybit', 'closing'), // Closed P&L: Sell = закрыл лонг
  makeParser('binance', 'opening'),
  makeParser('okx', 'opening'),
  makeParser('bingx', 'opening'),
  makeParser('bitget', 'opening'),
  makeParser('mexc', 'opening'),
  makeParser('hyperliquid', 'opening'),
  makeParser('other', 'opening'),
]

export function parserFor(exchange: string): ImportParser | undefined {
  return IMPORT_PARSERS.find((p) => p.exchange === exchange)
}
