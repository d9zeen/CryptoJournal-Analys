/**
 * История исполнений (fills): одна строка = одно исполнение ордера
 * (Binance Futures / Spot Trade History, Bybit / OKX Trade History и похожие).
 *
 * Собираем сделки сами: по каждой паре идём по времени и считаем позицию.
 * Позиция открывается с нуля, доливки усредняют вход, встречные исполнения закрывают;
 * когда позиция вернулась в ноль — это одна закрытая сделка. Если встречное исполнение
 * больше позиции (разворот), лишняя часть открывает новую позицию в другую сторону.
 */
import { grossPnl, round, type MarketType, type Side } from '@/lib/calc/trade'
import { parseDateCell, parseNumberCell, stableHash } from './values'
import { bareSide, feeCoinOf, feeToUsd, fillSign, marketOf, normalizeSymbol, type ImportField } from './fields'
import type { CsvTable } from './csv'
import type { ColumnMapping } from './mapping'
import type { ImportedTrade, ParsedRow, ParseOptions, RowError, RowWarning } from './types'
import { finalPnl } from './pnl'

type Fill = {
  line: number
  symbol: string
  market: MarketType
  sign: 1 | -1
  qty: number // монеты (linear/spot) или контракты по 1 $ (inverse)
  price: number
  at: string
  fee: number // уже в $
  feeUnknown: boolean
  pnl: number | null // реализованный PnL из файла (в $)
  /** sideFallback 'positionSide': сторона позиции (+1 лонг / −1 шорт) — открытие это или закрытие, решаем при сборке */
  posDir: 1 | -1 | null
  key: string // id исполнения / ордера — для стабильного id сделки
}

type Position = {
  symbol: string
  market: MarketType
  sign: 1 | -1
  open: number // открытый объём
  entryQty: number
  entryNotional: number // Σ q·p
  entryCoins: number // Σ q/p — для inverse
  exitQty: number
  exitNotional: number
  exitCoins: number
  fee: number
  feeUnknown: boolean
  pnl: number
  pnlSeen: boolean
  entryAt: string
  exitAt: string
  firstLine: number
  lastLine: number
  key: string
  guessed: boolean
}

const EPS = 1e-9

export function parseFills(table: CsvTable, mapping: ColumnMapping<string>, { utcOffsetMinutes, market: marketChoice, sideFallback }: ParseOptions, exchange: string): ParsedRow[] {
  const has = (f: ImportField) => mapping[f] >= 0
  const out: ParsedRow[] = []
  const fills: Fill[] = []

  // 1. Разбираем строки
  table.rows.forEach((row, i) => {
    const line = i + 2
    const cell = (f: ImportField) => (has(f) ? row[mapping[f]] : undefined)
    const n = (f: ImportField) => parseNumberCell(cell(f))
    const fail = (error: RowError, detail?: string) => out.push({ line, trade: null, error, detail, warnings: [] })

    const symbol = normalizeSymbol(cell('symbol'))
    if (!symbol) return fail('symbol')
    const qtyRaw = n('qty')
    const posDir = sideFallback === 'positionSide' ? bareSide(cell('side')) : null
    const fallback =
      sideFallback === 'qtySign' ? (qtyRaw ? (Math.sign(qtyRaw) as 1 | -1) : null) : sideFallback === 'longIsBuy' ? bareSide(cell('side')) : posDir
    const sign = posDir ?? fillSign(cell('side')) ?? (has('sideHint') ? fillSign(`${cell('side') ?? ''} ${cell('sideHint') ?? ''}`) : null) ?? fallback
    if (!sign) return fail('side', [cell('side'), has('sideHint') ? cell('sideHint') : undefined].filter(Boolean).join(' / '))
    const price = n('price')
    if (price === null || price <= 0) return fail('price')
    const market = marketChoice === 'auto' ? marketOf(symbol) : marketChoice
    const value = n('value')
    const qty = Math.abs(qtyRaw ?? (value !== null ? (market === 'inverse' ? value : value / price) : 0))
    if (!(qty > 0)) return fail('size')
    const at = parseDateCell(cell('closeTime'), utcOffsetMinutes)
    if (!at) return fail('time')

    let fee = 0
    let feeUnknown = false
    if (has('fee')) {
      const usd = feeToUsd(n('fee') ?? 0, feeCoinOf(cell('fee'), cell('feeCoin')), symbol, price, market)
      if (usd === null) feeUnknown = true
      else fee = usd
    }
    const pnlRaw = n('pnl')
    const pnl = pnlRaw === null ? null : market === 'inverse' ? pnlRaw * price : pnlRaw
    const key = (cell('orderId') ?? '').trim() || `${price}|${qty}`
    fills.push({ line, symbol, market, sign, qty, price, at, fee, feeUnknown, pnl, posDir, key })
  })

  // 2. Собираем позиции: по времени, при равном времени — по порядку строк
  fills.sort((a, b) => a.at.localeCompare(b.at) || a.line - b.line)
  const open = new Map<string, Position>()
  const seen = new Map<string, number>()

  const start = (f: Fill, qty: number, fee: number): Position => ({
    symbol: f.symbol,
    market: f.market,
    sign: f.sign,
    open: qty,
    entryQty: qty,
    entryNotional: qty * f.price,
    entryCoins: qty / f.price,
    exitQty: 0,
    exitNotional: 0,
    exitCoins: 0,
    fee,
    feeUnknown: f.feeUnknown,
    pnl: 0,
    pnlSeen: false,
    entryAt: f.at,
    exitAt: f.at,
    firstLine: f.line,
    lastLine: f.line,
    key: f.key,
    guessed: false,
  })

  const emit = (p: Position) => {
    const side: Side = p.sign === 1 ? 'long' : 'short'
    const inverse = p.market === 'inverse'
    const entryPrice = inverse ? p.entryQty / p.entryCoins : p.entryNotional / p.entryQty
    const exitPrice = inverse ? p.exitQty / p.exitCoins : p.exitNotional / p.exitQty
    const sizeUsd = inverse ? p.entryQty : p.entryNotional
    const gross = grossPnl({ marketType: p.market, side, entryPrice, exitPrice, sizeUsd })!
    const { pnl, pnlManual } = finalPnl({ gross, fee: p.fee, funding: 0, filePnl: p.pnlSeen ? p.pnl : null, sizeUsd })
    const warnings: RowWarning[] = []
    if (p.feeUnknown) warnings.push('feeNotUsd')
    if (p.guessed) warnings.push('sideGuessed')
    if (pnlManual) warnings.push('pnlFromFile')
    const baseId = `f:${stableHash([p.symbol, side, p.entryAt, p.key].join('|'))}`
    const dup = (seen.get(baseId) ?? 0) + 1
    seen.set(baseId, dup)
    const trade: ImportedTrade = {
      exchange,
      market_type: p.market,
      symbol: p.symbol,
      side,
      entry_at: p.entryAt,
      exit_at: p.exitAt,
      entry_price: round(entryPrice, 12),
      exit_price: round(exitPrice, 12),
      size_usd: round(sizeUsd, 8),
      leverage: 1,
      fee: round(p.fee, 8),
      funding: 0,
      pnl: round(pnl, 8),
      pnl_manual: pnlManual,
      external_id: (dup > 1 ? `${baseId}#${dup}` : baseId).slice(0, 200),
    }
    out.push({ line: p.firstLine, lineTo: p.lastLine, trade, error: null, warnings })
  }

  // Long / Short — сторона позиции: открытие или закрытие?
  //  * есть закрытый PnL исполнения: не ноль (и не просто минус комиссия) — закрытие;
  //  * нет PnL: позиции нет — открытие; объём не больше позиции — закрытие, больше — доливка (угадано, предупреждаем).
  // Позиции в лонг и в шорт по одной паре ведём отдельно (режим хеджирования).
  const byPnl = sideFallback === 'positionSide' && has('pnl')
  const posKey = (f: Fill) => (f.posDir ? `${f.symbol}|${f.posDir}` : f.symbol)
  // PnL исполнения — не ноль и не просто комиссия (некоторые биржи пишут в PnL открытия минус комиссию)
  const realized = (f: Fill) => f.pnl !== null && Math.abs(f.pnl) > 1e-9 && Math.abs(Math.abs(f.pnl) - f.fee) > 1e-6 * Math.max(1, f.fee)
  const isClose = (f: Fill, p: Position | undefined): boolean => {
    if (!p) return false
    if (byPnl) return realized(f)
    return f.qty <= p.open * (1 + 1e-6)
  }

  for (const f of fills) {
    const k = posKey(f)
    const p = open.get(k)
    if (f.posDir) {
      const closing = isClose(f, p)
      if (!p && byPnl && realized(f)) {
        // закрытие позиции, которая открылась раньше начала файла
        out.push({ line: f.line, trade: null, error: 'closeNoOpen', warnings: [] })
        continue
      }
      f.sign = closing ? ((-f.posDir) as 1 | -1) : f.posDir
      if (p && !byPnl) p.guessed = true
      if (closing && p && f.qty > p.open) f.qty = p.open // закрытие не разворачивает позицию: другая сторона — отдельная позиция
    }
    if (!p) {
      if (f.market === 'spot' && f.sign === -1) {
        out.push({ line: f.line, trade: null, error: 'spotNoBuy', warnings: [] })
        continue
      }
      open.set(k, start(f, f.qty, f.fee))
      continue
    }
    p.firstLine = Math.min(p.firstLine, f.line)
    p.lastLine = Math.max(p.lastLine, f.line)
    p.feeUnknown ||= f.feeUnknown
    if (f.sign === p.sign) {
      // доливка
      p.open += f.qty
      p.entryQty += f.qty
      p.entryNotional += f.qty * f.price
      p.entryCoins += f.qty / f.price
      p.fee += f.fee
      continue
    }
    // закрытие (частичное, полное или с разворотом)
    const close = Math.min(f.qty, p.open)
    const part = close / f.qty
    p.open -= close
    p.exitQty += close
    p.exitNotional += close * f.price
    p.exitCoins += close / f.price
    p.fee += f.fee * part
    if (f.pnl !== null) {
      p.pnl += f.pnl
      p.pnlSeen = true
    }
    p.exitAt = f.at
    if (p.open <= EPS * p.entryQty) {
      emit(p)
      open.delete(k)
      const rest = f.qty - close
      if (rest > EPS * f.qty) {
        if (f.market === 'spot') out.push({ line: f.line, trade: null, error: 'spotNoBuy', warnings: [] })
        else open.set(k, start(f, rest, f.fee * (1 - part)))
      }
    }
  }

  // 3. Не закрытые к концу файла позиции не импортируем — сообщаем
  for (const p of open.values()) out.push({ line: p.firstLine, lineTo: p.lastLine, trade: null, error: 'stillOpen', warnings: [] })

  return out.sort((a, b) => a.line - b.line)
}
