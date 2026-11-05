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
  funding: number // фандинг за время позиции, $ (плюс — получили)
  entryAt: string
  exitAt: string
  firstLine: number
  lastLine: number
  key: string
  guessed: boolean
}

const EPS = 1e-9

/**
 * Long / Short без PnL и без «открытие / закрытие»: какие исполнения закрывают позицию?
 * Перебираем варианты (лучевой поиск) и берём тот, где позиция чаще всего возвращается ровно в ноль:
 * случайно объёмы в ноль не сходятся, поэтому это надёжный признак настоящих закрытий.
 */
function guessCloses(fills: Fill[], keyOf: (f: Fill) => string): Set<Fill> {
  const byKey = new Map<string, Fill[]>()
  for (const f of fills) {
    const k = keyOf(f)
    const list = byKey.get(k)
    if (list) list.push(f)
    else byKey.set(k, [f])
  }
  const closes = new Set<Fill>()
  const BEAM = 96
  type State = { pos: number; zeros: number; parent: number; close: boolean }
  for (const list of byKey.values()) {
    const steps: State[][] = []
    let cur: State[] = [{ pos: 0, zeros: 0, parent: -1, close: false }]
    for (const f of list) {
      const next = new Map<string, State>()
      const add = (st: State) => {
        const k = st.pos.toPrecision(10)
        const old = next.get(k)
        if (!old || st.zeros > old.zeros) next.set(k, st)
      }
      cur.forEach((st, i) => {
        add({ pos: st.pos + f.qty, zeros: st.zeros, parent: i, close: false })
        if (st.pos > EPS && f.qty <= st.pos * (1 + 1e-6)) {
          const left = st.pos - f.qty
          const flat = left <= st.pos * 1e-6
          add({ pos: flat ? 0 : left, zeros: st.zeros + (flat ? 1 : 0), parent: i, close: true })
        }
      })
      // при равенстве — вариант, где позиция больше: обычно сначала набирают позицию, потом закрывают
      cur = [...next.values()].sort((a, b) => b.zeros - a.zeros || b.pos - a.pos).slice(0, BEAM)
      steps.push(cur)
    }
    // лучший конец: больше закрытий в ноль, при равенстве — позиция в конце в нуле
    let idx = 0
    cur.forEach((st, i) => {
      const best = cur[idx]
      if (st.zeros > best.zeros || (st.zeros === best.zeros && st.pos === 0 && best.pos !== 0)) idx = i
    })
    for (let s = steps.length - 1; s >= 0 && idx >= 0; s--) {
      const st = steps[s][idx]
      if (st.close) closes.add(list[s])
      idx = st.parent
    }
  }
  return closes
}

export function parseFills(table: CsvTable, mapping: ColumnMapping<string>, { utcOffsetMinutes, market: marketChoice, sideFallback }: ParseOptions, exchange: string): ParsedRow[] {
  const has = (f: ImportField) => mapping[f] >= 0
  const out: ParsedRow[] = []
  const fills: Fill[] = []
  const fundings: { line: number; symbol: string; at: string; amount: number }[] = []

  // 1. Разбираем строки
  table.rows.forEach((row, i) => {
    const line = i + 2
    const cell = (f: ImportField) => (has(f) ? row[mapping[f]] : undefined)
    const n = (f: ImportField) => parseNumberCell(cell(f))
    const fail = (error: RowError, detail?: string) => out.push({ line, trade: null, error, detail, warnings: [] })

    const symbol = normalizeSymbol(cell('symbol'))
    if (!symbol) return fail('symbol')
    // строка фандинга (Bybit UTA: Filled Type = Funding) — не сделка: её сумму добавим к фандингу открытой позиции
    if (/fund|фандинг|资金/i.test(cell('rowType') ?? '')) {
      const at = parseDateCell(cell('closeTime'), utcOffsetMinutes)
      const amount = n('fee') ?? n('funding')
      if (at && amount !== null) fundings.push({ line, symbol, at, amount: -amount }) // комиссия фандинга «+» — заплатили
      return
    }
    const qtyRaw = n('qty')
    const posDir = sideFallback === 'positionSide' ? bareSide(cell('side')) : null
    const fallback =
      sideFallback === 'qtySign' ? (qtyRaw ? (Math.sign(qtyRaw) as 1 | -1) : null) : sideFallback === 'longIsBuy' ? bareSide(cell('side')) : posDir
    const sign = posDir ?? fillSign(cell('side')) ?? (has('sideHint') ? fillSign(`${cell('side') ?? ''} ${cell('sideHint') ?? ''}`) : null) ?? fallback
    if (!sign) return fail('side', [cell('side'), has('sideHint') ? cell('sideHint') : undefined].filter(Boolean).join(' / '))
    const market = marketChoice === 'auto' ? marketOf(symbol) : marketChoice
    const value = n('value')
    // цены нет (рыночный ордер, «--») — считаем из суммы и объёма
    let price = n('price')
    if ((price === null || price <= 0) && value && qtyRaw) price = market === 'inverse' ? Math.abs(qtyRaw / value) : Math.abs(value / qtyRaw)
    if (price === null || !(price > 0)) return fail('price', cell('price'))
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
  // если файл идёт от новых к старым, исполнения в одну и ту же минуту берём снизу вверх
  const byLine = [...fills].sort((a, b) => a.line - b.line)
  const newestFirst = byLine.length > 1 && byLine[0].at > byLine[byLine.length - 1].at
  const tie = (a: { line: number }, b: { line: number }) => (newestFirst ? b.line - a.line : a.line - b.line)
  fills.sort((a, b) => a.at.localeCompare(b.at) || tie(a, b))
  fundings.sort((a, b) => a.at.localeCompare(b.at) || tie(a, b))
  let fi = 0
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
    funding: 0,
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
    const { pnl, pnlManual } = finalPnl({ gross, fee: p.fee, funding: p.funding, filePnl: p.pnlSeen ? p.pnl : null, sizeUsd })
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
      funding: round(p.funding, 8),
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
  const guessed = sideFallback === 'positionSide' && !byPnl ? guessCloses(fills.filter((f) => f.posDir), posKey) : null
  const isClose = (f: Fill, p: Position | undefined): boolean => {
    if (!p) return false
    if (byPnl) return realized(f)
    return guessed?.has(f) ?? false
  }

  // фандинг, начисленный до этого момента, — открытой позиции по этой паре
  const applyFunding = (until: string | null) => {
    while (fi < fundings.length && (until === null || fundings[fi].at <= until)) {
      const fu = fundings[fi++]
      for (const [key, pos] of open) if (key === fu.symbol || key.startsWith(`${fu.symbol}|`)) {
        pos.funding += fu.amount
        break
      }
    }
  }

  for (const f of fills) {
    applyFunding(f.at)
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

  applyFunding(null)

  // 3. Не закрытые к концу файла позиции не импортируем — сообщаем
  for (const p of open.values()) out.push({ line: p.firstLine, lineTo: p.lastLine, trade: null, error: 'stillOpen', warnings: [] })

  return out.sort((a, b) => a.line - b.line)
}
