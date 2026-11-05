/**
 * Hyperliquid (DEX) → сделки. Нужен только публичный адрес кошелька: история сделок у Hyperliquid открыта.
 * Источник — POST https://api.hyperliquid.xyz/info {type: 'userFillsByTime'} (исполнения, не больше 2000 за раз).
 * Исполнения собираются в сделки тем же движком, что история исполнений из файла (lib/import/fills.ts).
 */
import type { CsvTable } from '@/lib/import/csv'
import { makeParser } from '@/lib/import/universal'
import { prepareImport } from '@/lib/import/plan'
import type { ImportedTrade } from '@/lib/import/types'

export const HL_API = 'https://api.hyperliquid.xyz/info'

export type HlFill = {
  coin: string
  px: string
  sz: string
  side: 'B' | 'A'
  time: number
  dir: string // Open Long / Close Long / Open Short / Close Short / Long > Short / Buy / Sell (спот)
  fee: string
  feeToken?: string
  oid: number
  tid: number
  /** размер позиции до этого исполнения (0 — позиция открывается с нуля) */
  startPosition?: string
}

/** Все исполнения с startTime: страницы по 2000 (Hyperliquid хранит последние 10 000) */
export async function fetchHlFills(address: string, startTime: number, fetchFn: typeof fetch = fetch): Promise<HlFill[]> {
  const all: HlFill[] = []
  let from = startTime
  for (let page = 0; page < 10; page++) {
    const res = await fetchFn(HL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'userFillsByTime', user: address, startTime: from, aggregateByTime: true }),
    })
    if (!res.ok) throw new Error(`HL_HTTP_${res.status}`)
    const part = (await res.json()) as HlFill[]
    all.push(...part)
    if (part.length < 2000) break
    from = Math.max(...part.map((f) => f.time)) + 1
  }
  return all
}

/** Только бессрочные контракты: у спота нет Long / Short в направлении */
const isPerp = (f: HlFill) => /long|short/i.test(f.dir) && !f.coin.startsWith('@') && !f.coin.includes('/')

/** Пара для дневника: BTC → BTCUSDC, kPEPE → KPEPEUSDC, xyz:TSLA → XYZ-TSLAUSDC */
export const hlSymbol = (coin: string) => `${coin.toUpperCase().replace(/:/g, '-')}USDC`

/**
 * Исполнения → таблица в формате «истории исполнений».
 * По каждой монете пропускаем исполнения до первого открытия «с нуля» (startPosition = 0):
 * иначе закрытие позиции, открытой до начала периода, выглядело бы как новая позиция.
 */
export function hlFillsToTable(fills: HlFill[]): CsvTable {
  const started = new Set<string>()
  const rows = fills
    .filter(isPerp)
    .sort((a, b) => a.time - b.time || a.tid - b.tid)
    .filter((f) => {
      if (started.has(f.coin)) return true
      if (f.startPosition !== undefined && Number(f.startPosition) !== 0) return false
      started.add(f.coin)
      return true
    })
    .map((f) => [hlSymbol(f.coin), f.side === 'B' ? 'Buy' : 'Sell', f.sz, f.px, f.fee, f.feeToken ?? 'USDC', new Date(f.time).toISOString(), String(f.oid)])
  return { headers: ['Symbol', 'Side', 'Qty', 'Price', 'Fee', 'Fee Coin', 'Time', 'Order ID'], rows, delimiter: ',' }
}

const parser = makeParser('hyperliquid', 'opening')

/**
 * Исполнения → закрытые сделки + курсор для следующей синхронизации:
 * если какая-то позиция ещё открыта — следующий раз грузим с её первого исполнения (чтобы собрать её целиком).
 */
export function hlFillsToTrades(fills: HlFill[]): { trades: ImportedTrade[]; cursor: number | null } {
  const table = hlFillsToTable(fills)
  if (!table.rows.length) return { trades: [], cursor: null }
  const prep = prepareImport(table, parser)
  const trades = prep.rows.flatMap((r) => (r.trade ? [r.trade] : []))
  const openStarts = prep.rows.filter((r) => r.error === 'stillOpen').map((r) => Date.parse(table.rows[r.line - 2][6]))
  const lastTime = Date.parse(table.rows[table.rows.length - 1][6])
  return { trades, cursor: openStarts.length ? Math.min(...openStarts) : lastTime + 1 }
}
