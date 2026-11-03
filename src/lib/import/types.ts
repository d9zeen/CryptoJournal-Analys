import type { MarketType, Side } from '@/lib/calc/trade'
import type { CsvTable } from './csv'
import type { ColumnMapping } from './mapping'

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

/** Почему строку нельзя импортировать */
export type RowError = 'symbol' | 'side' | 'entryPrice' | 'exitPrice' | 'size' | 'time' | 'pnl'

/** Предупреждения — строку импортируем, но пользователю стоит знать */
export type RowWarning =
  | 'noEntryTime' // в файле нет времени входа — ставим время выхода
  | 'feeDerived' // комиссий в файле нет — посчитали как разницу между валовым PnL и PnL из файла
  | 'pnlFromFile' // PnL из файла не сходится с формулой — оставили биржевой

export type ParsedRow = {
  /** номер строки в файле (заголовок = 1) */
  line: number
  trade: ImportedTrade | null
  error: RowError | null
  warnings: RowWarning[]
}

export type ParseOptions = {
  /** в каком поясе записано время без явного смещения, минуты (UTC+3 → 180) */
  utcOffsetMinutes: number
}

/** Парсер файла одной биржи. Новая биржа = новый объект в registry.ts */
export type ImportParser<F extends string = string> = {
  /** id биржи (как в lib/exchanges.ts) */
  exchange: string
  /** поля и синонимы названий колонок; порядок важен для автосопоставления */
  fields: Record<F, readonly string[]>
  /** без каких полей импорт невозможен (группа — «хотя бы одно из») */
  required: (F | F[])[]
  /** поле времени, по заголовку которого определяем часовой пояс файла */
  timeField: F
  parse: (table: CsvTable, mapping: ColumnMapping<F>, options: ParseOptions) => ParsedRow[]
}

/** Каких обязательных полей не хватает (для группы — первое поле группы). */
export function missingFields<F extends string>(parser: ImportParser<F>, mapping: ColumnMapping<F>): F[] {
  return parser.required
    .filter((r) => (Array.isArray(r) ? r.every((f) => mapping[f] < 0) : mapping[r] < 0))
    .map((r) => (Array.isArray(r) ? r[0] : r))
}
