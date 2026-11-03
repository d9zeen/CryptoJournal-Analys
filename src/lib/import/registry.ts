/**
 * Реестр парсеров CSV. Чтобы добавить биржу (BingX, OKX…):
 * 1) создать lib/import/<биржа>.ts по образцу bybit.ts;
 * 2) добавить его в список ниже;
 * 3) добавить подписи полей в i18n (import.fields), если появились новые.
 */
import { bybitParser } from './bybit'
import type { ImportParser } from './types'

export const IMPORT_PARSERS: ImportParser[] = [bybitParser as unknown as ImportParser]

export function parserFor(exchange: string): ImportParser | undefined {
  return IMPORT_PARSERS.find((p) => p.exchange === exchange)
}
