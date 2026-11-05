import type { MarketType, Side } from '@/lib/calc/trade'
import type { CsvTable } from './csv'
import type { ColumnMapping } from './mapping'
import type { ImportField } from './fields'

/** Сделка из файла — в том виде, в каком пойдёт в таблицу trades. */
export type ImportedTrade = {
  exchange: string
  market_type: MarketType
  symbol: string
  side: Side
  entry_at: string
  exit_at: string
  entry_price: number
  exit_price: number
  size_usd: number
  leverage: number
  fee: number
  funding: number
  pnl: number
  /** true — PnL взят из файла и не совпадает с формулой (например, из-за фандинга) */
  pnl_manual: boolean
  /** id на бирже или отпечаток строки — защита от повторного импорта */
  external_id: string
}

/** Почему строку (или позицию) нельзя импортировать */
export type RowError =
  | 'symbol'
  | 'side'
  | 'entryPrice'
  | 'exitPrice'
  | 'price'
  | 'size'
  | 'time'
  | 'pnl'
  | 'stillOpen' // в истории сделок позиция так и не закрылась к концу файла
  | 'spotNoBuy' // спот: продажа монет, купленных до начала файла
  | 'closeNoOpen' // закрытие позиции, открытой раньше периода файла

/** Предупреждения — строку импортируем, но пользователю стоит знать */
export type RowWarning =
  | 'noEntryTime' // в файле нет времени входа — ставим время выхода
  | 'feeDerived' // комиссий в файле нет — посчитали как разницу между валовым PnL и PnL из файла
  | 'pnlFromFile' // PnL из файла не сходится с формулой — оставили биржевой
  | 'feeNotUsd' // комиссия в посторонней монете (BNB и т.п.) — не учли
  | 'sideGuessed' // открытие / закрытие угадано по объёму позиции (в файле нет ни открытия / закрытия, ни PnL)

export type ParsedRow = {
  /** номер строки в файле (заголовок = 1); для истории сделок — первая строка позиции */
  line: number
  /** последняя строка позиции (история сделок: позиция собрана из нескольких строк) */
  lineTo?: number
  trade: ImportedTrade | null
  error: RowError | null
  /** что было в ячейке, из-за которой ошибка (показываем пользователю) */
  detail?: string
  warnings: RowWarning[]
}

/** Вид выгрузки: закрытые позиции (строка = позиция) или история исполнений (строка = исполнение ордера) */
export type ImportMode = 'positions' | 'fills'

/** Рынок: auto — по названию пары (BTCUSD — coin-M, остальное — USDT-фьючерсы) */
export type MarketChoice = 'auto' | 'linear' | 'inverse' | 'spot'

export type SideFallback = 'longIsBuy' | 'qtySign' | 'positionSide'

export type ParseOptions = {
  /** в каком поясе записано время без явного смещения, минуты (UTC+3 → 180) */
  utcOffsetMinutes: number
  market: MarketChoice
  /**
   * История исполнений, где направление — просто «Long» / «Short» без открытия / закрытия:
   * 'longIsBuy' — Long = покупка, Short = продажа; 'qtySign' — по знаку объёма (продажа с минусом);
   * 'positionSide' — Long / Short это сторона позиции (Bybit UTA Trade History): открытие или закрытие
   * понимаем по закрытому PnL исполнения (не ноль — закрытие), а без колонки PnL — по объёму позиции.
   * Подбирается само (plan.ts), если обычное направление не читается.
   */
  sideFallback?: SideFallback
}

/** Парсер файлов одной биржи. Все биржи используют общий движок (universal.ts) со своими настройками. */
export type ImportParser = {
  /** id биржи (как в lib/exchanges.ts) */
  exchange: string
  fields: Record<ImportField, readonly string[]>
  /** поле времени, по заголовку которого определяем часовой пояс файла */
  timeField: ImportField
  /** вид выгрузки по найденным колонкам; null — не понятно */
  mode: (mapping: ColumnMapping<string>) => ImportMode | null
  /** обязательные поля для вида выгрузки */
  required: (mode: ImportMode | null) => ImportField[]
  /** каких обязательных полей не хватает */
  missing: (mapping: ColumnMapping<string>) => ImportField[]
  parse: (table: CsvTable, mapping: ColumnMapping<string>, options: ParseOptions) => ParsedRow[]
}
