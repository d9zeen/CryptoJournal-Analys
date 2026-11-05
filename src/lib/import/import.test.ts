import { describe, expect, it } from 'vitest'
import { detectDelimiter, parseCsv } from './csv'
import { offsetFromHeader, parseDateCell, parseNumberCell, stableHash } from './values'
import { autoMap, normalizeHeader } from './mapping'
import { FIELDS, FUZZY, fillSign } from './fields'
import { bybitParser, marketOf, normalizeSymbol, positionSide } from './bybit'
import { planImport, prepareImport } from './plan'

describe('csv', () => {
  it('кавычки, запятые и переносы внутри, BOM, CRLF, пустые строки', () => {
    const t = parseCsv('\uFEFFa,b,c\r\n1,"x, y","he said ""hi"""\r\n\r\n2,"multi\nline",3\n')
    expect(t.headers).toEqual(['a', 'b', 'c'])
    expect(t.rows).toEqual([
      ['1', 'x, y', 'he said "hi"'],
      ['2', 'multi\nline', '3'],
    ])
  })
  it('разделитель ; и Tab определяется сам', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';')
    expect(detectDelimiter('a\tb\n1\t2')).toBe('\t')
    expect(detectDelimiter('"a;b",c,d')).toBe(',')
    expect(parseCsv('a;b\n1,5;2').rows).toEqual([['1,5', '2']])
  })
})

describe('числа', () => {
  it.each([
    ['1234.5', 1234.5],
    ['1,234.50', 1234.5],
    ['1.234,50', 1234.5],
    ['1 234,5', 1234.5],
    ['0,5', 0.5],
    ['12,3456', 12.3456],
    ['1,234,567', 1234567],
    ['-0.012 USDT', -0.012],
    ['+12.5%', 12.5],
    ['−3.2', -3.2],
    ['10x', 10],
    ['1e-5', 0.00001],
  ])('%s → %s', (raw, n) => expect(parseNumberCell(raw)).toBeCloseTo(n, 10))
  it.each(['', '--', 'N/A', 'abc', '1.2.3'])('«%s» → null', (raw) => expect(parseNumberCell(raw)).toBeNull())
})

describe('даты', () => {
  it('разные форматы, по умолчанию UTC', () => {
    const iso = '2026-11-03T14:05:06.000Z'
    expect(parseDateCell('2026-11-03 14:05:06')).toBe(iso)
    expect(parseDateCell('2026/11/03 14:05:06')).toBe(iso)
    expect(parseDateCell('03.11.2026 14:05:06')).toBe(iso)
    expect(parseDateCell('11/03/2026 14:05:06')).toBe(iso) // м/д/г
    expect(parseDateCell('25/11/2026 14:05')).toBe('2026-11-25T14:05:00.000Z') // 25 > 12 → д/м/г
    expect(parseDateCell('11/03/2026 02:05:06 PM')).toBe(iso)
    expect(parseDateCell('2026-11-03T17:05:06+03:00')).toBe(iso)
    expect(parseDateCell('1793714706')).toBe(iso)
    expect(parseDateCell('1793714706000')).toBe(iso)
  })
  it('время файла в UTC+3 переводится в UTC', () => {
    expect(parseDateCell('2026-11-03 17:05:06', 180)).toBe('2026-11-03T14:05:06.000Z')
  })
  it('мусор и несуществующие даты → null', () => {
    expect(parseDateCell('31.02.2026 10:00')).toBeNull()
    expect(parseDateCell('2026-13-01')).toBeNull()
    expect(parseDateCell('вчера')).toBeNull()
    expect(parseDateCell('2026-11-03 25:00')).toBeNull()
  })
  it('пояс из заголовка', () => {
    expect(offsetFromHeader('Trade Time(UTC+0)')).toBe(0)
    expect(offsetFromHeader('Trade Time (UTC+3)')).toBe(180)
    expect(offsetFromHeader('Time UTC-05:30')).toBe(-330)
    expect(offsetFromHeader('Time (UTC)')).toBe(0)
    expect(offsetFromHeader('Trade Time')).toBeNull()
  })
  it('stableHash стабилен и различает строки', () => {
    expect(stableHash('abc')).toBe(stableHash('abc'))
    expect(stableHash('abc')).not.toBe(stableHash('abd'))
  })
})

describe('сопоставление колонок', () => {
  it('normalizeHeader убирает регистр, скобки и знаки', () => {
    expect(normalizeHeader('Trade Time(UTC+0)')).toBe('tradetime')
    expect(normalizeHeader('Closed P&L')).toBe('closedpl')
    expect(normalizeHeader('Кол-во')).toBe('колво')
  })
  it('колонка не достаётся двум полям, порядок синонимов важен', () => {
    const m = autoMap(['Time', 'Close Time'], { a: ['Close Time', 'Time'], b: ['Time'] })
    expect(m).toEqual({ a: 1, b: 0 })
    expect(autoMap(['x'], { a: ['y'] })).toEqual({ a: -1 })
  })
})

describe('bybit: мелкие правила', () => {
  it('сторона позиции по закрывающему ордеру', () => {
    expect(positionSide('Sell')).toBe('long')
    expect(positionSide('Buy')).toBe('short')
    expect(positionSide('Close Long')).toBe('long')
    expect(positionSide('Закрыть шорт')).toBe('short')
    expect(positionSide('?')).toBeNull()
  })
  it('тип рынка по паре', () => {
    expect(marketOf('BTCUSDT')).toBe('linear')
    expect(marketOf('BTCPERP')).toBe('linear')
    expect(marketOf('BTCUSD')).toBe('inverse')
    expect(marketOf('BTCUSDZ26')).toBe('inverse')
  })
  it('пара', () => {
    expect(normalizeSymbol(' btcusdt Perpetual')).toBe('BTCUSDT')
    expect(normalizeSymbol('')).toBeNull()
    expect(normalizeSymbol('BTC USDT ✓')).toBe('BTC')
  })
})

// Файл в духе экспорта Bybit «Closed P&L» (английский интерфейс)
const BYBIT_EN = [
  'Contracts,Closing Direction,Qty,Entry Price,Exit Price,Closed P&L,Opening Fee,Closing Fee,Exit Type,Trade Time(UTC+0),Order ID',
  'BTCUSDT,Sell,0.01,60000,61000,9.34,0.33,0.33,Trade,2026-11-01 10:00:00,a1', // long +10 gross −0.66 fee
  'ETHUSDT,Buy,1,3000,2900,99.5,0.25,0.25,Trade,2026-11-02 12:30:00,a2', // short +100 −0.5
  'SOLUSDT,Sell,10,150,148,-20.17,0.0825,0.0825,StopLoss,2026-11-02 15:00:00,a3', // long −20 −0.165
  'BTCUSD,Sell,6100,61000,62000,0.00016,0.0000001,0.0000001,Trade,2026-11-03 09:00:00,a4', // inverse long
  ',Sell,1,1,1,0,0,0,Trade,2026-11-03 10:00:00,a5', // нет пары
  'XRPUSDT,Sell,100,0.5,0.6,10,0,0,Trade,вчера,a6', // плохая дата
].join('\n')

describe('bybit: разбор файла', () => {
  const prep = prepareImport(BYBIT_EN, bybitParser)
  const ok = prep.rows.filter((r) => r.trade)

  it('колонки и пояс найдены', () => {
    expect(prep.missing).toEqual([])
    expect(prep.offsetDetected).toBe(true)
    expect(prep.utcOffsetMinutes).toBe(0)
    expect(prep.mapping.orderId).toBe(10)
  })
  it('long: сторона, размер, комиссии, PnL из файла совпадает с формулой', () => {
    const t = ok[0].trade!
    expect(t).toMatchObject({ symbol: 'BTCUSDT', side: 'long', market_type: 'linear', size_usd: 600, fee: 0.66, pnl: 9.34, pnl_manual: false, external_id: 'o:a1' })
    expect(t.exit_at).toBe('2026-11-01T10:00:00.000Z')
    expect(ok[0].warnings).toEqual(['noEntryTime'])
    expect(t.entry_at).toBe(t.exit_at)
  })
  it('short по Buy', () => {
    expect(ok[1].trade).toMatchObject({ side: 'short', size_usd: 3000, pnl: 99.5, pnl_manual: false })
  })
  it('инверсный: размер в $, PnL и комиссии из монеты в $ по цене выхода', () => {
    const t = ok[3].trade!
    expect(t.market_type).toBe('inverse')
    expect(t.size_usd).toBe(6100)
    expect(t.pnl).toBeCloseTo(0.00016 * 62000, 6)
    expect(t.fee).toBeCloseTo(0.0000002 * 62000, 8)
  })
  it('ошибки строк с номерами', () => {
    const bad = prep.rows.filter((r) => r.error)
    expect(bad.map((r) => [r.line, r.error])).toEqual([
      [6, 'symbol'],
      [7, 'time'],
    ])
  })
  it('пояс можно задать руками', () => {
    const p = prepareImport(BYBIT_EN, bybitParser, { utcOffsetMinutes: 180 })
    expect(p.rows[0].trade!.exit_at).toBe('2026-11-01T07:00:00.000Z')
  })
})

describe('bybit: русские колонки, без комиссий и Order ID', () => {
  const RU = [
    'Контракты;Направление закрытия;Кол-во;Цена входа;Цена выхода;Закрытый P&L;Время открытия;Время сделки',
    'BTCUSDT;Продажа;0,01;60000;61000;9,4;03.11.2026 09:00;03.11.2026 10:00',
    'BTCUSDT;Продажа;0,01;60000;61000;9,4;03.11.2026 09:00;03.11.2026 10:00',
  ].join('\n')
  const prep = prepareImport(RU, bybitParser)

  it('колонки распознаны, время входа есть', () => {
    expect(prep.missing).toEqual([])
    expect(prep.offsetDetected).toBe(false)
    const r = prep.rows[0]
    expect(r.trade).toMatchObject({ side: 'long', entry_at: '2026-11-03T09:00:00.000Z', exit_at: '2026-11-03T10:00:00.000Z' })
    expect(r.warnings).not.toContain('noEntryTime')
  })
  it('комиссия = валовый PnL − PnL из файла', () => {
    expect(prep.rows[0].trade!.fee).toBeCloseTo(0.6, 8)
    expect(prep.rows[0].warnings).toContain('feeDerived')
    expect(prep.rows[0].trade!.pnl_manual).toBe(false)
  })
  it('одинаковые строки получают разные, но стабильные id', () => {
    const [a, b] = prep.rows.map((r) => r.trade!.external_id)
    expect(a).toMatch(/^h:/)
    expect(b).toBe(`${a}#2`)
    expect(prepareImport(RU, bybitParser).rows[0].trade!.external_id).toBe(a)
  })
})

describe('bybit: не хватает колонок', () => {
  it('сообщаем, каких полей нет, и строки не разбираем', () => {
    const p = prepareImport('Contracts,Qty\nBTCUSDT,1', bybitParser)
    expect(p.missing).toEqual(['side', 'entryPrice', 'exitPrice', 'closeTime'])
    expect(p.rows).toEqual([])
  })
  it('объём можно заменить стоимостью входа', () => {
    const p = prepareImport('Symbol,Side,Entry Value,Entry Price,Exit Price,Time\nBTCUSDT,Sell,600,60000,61000,2026-11-01 10:00', bybitParser)
    expect(p.missing).toEqual([])
    expect(p.rows[0].trade!.size_usd).toBe(600)
    expect(p.rows[0].trade!.pnl).toBeCloseTo(10, 8) // PnL посчитан формулой
  })
  it('PnL из файла с фандингом не сходится с формулой → pnl_manual', () => {
    const p = prepareImport(
      'Symbol,Side,Qty,Entry Price,Exit Price,Closed P&L,Trading Fee,Time\nBTCUSDT,Sell,0.01,60000,61000,5,0.66,2026-11-01 10:00',
      bybitParser,
    )
    expect(p.rows[0].trade).toMatchObject({ pnl: 5, fee: 0.66, pnl_manual: true })
    expect(p.rows[0].warnings).toContain('pnlFromFile')
  })
})

describe('planImport', () => {
  const prep = prepareImport(BYBIT_EN, bybitParser)

  it('дубли, ошибки, новые', () => {
    const plan = planImport(prep.rows, new Set(['o:a2']), null)
    expect(plan.counts).toEqual({ new: 3, duplicate: 1, error: 2, overLimit: 0 })
    expect(plan.toInsert.map((t) => t.external_id)).toEqual(['o:a1', 'o:a3', 'o:a4'])
  })
  it('лимит: берём самые старые, остальное — сверх лимита', () => {
    const plan = planImport(prep.rows, new Set(), 2)
    expect(plan.toInsert.map((t) => t.external_id)).toEqual(['o:a1', 'o:a2'])
    expect(plan.counts.overLimit).toBe(2)
    expect(plan.status.get(3)).toBe('overLimit') // 4-я запись = строка 5 файла
    expect(planImport(prep.rows, new Set(), 0).toInsert).toEqual([])
  })
})

describe('объём находится сам: новые названия колонок Bybit UTA', () => {
  it('запасной поиск по слову: исполненный объём важнее объёма ордера', () => {
    const headers = ['Market', 'Direction', 'Order Qty', 'Exec. Qty / Contracts', 'Filled Price', 'Transaction Time(UTC+0)']
    const m = autoMap(headers, FIELDS, FUZZY)
    expect(m.qty).toBe(3)
  })
  it('без точного совпадения берётся даже объём ордера — лучше, чем просить руками', () => {
    const m = autoMap(['Market', 'Direction', 'Order Quantity', 'Filled Price', 'Time'], FIELDS, FUZZY)
    expect(m.qty).toBe(2)
  })
  it('история исполнений UTA: файл разбирается без ручной настройки', () => {
    const UTA = [
      'Market,Direction,Filled Quantity,Filled Price,Filled Value,Trading Fee,feeCoin,Transaction Time(UTC+0),Order No.',
      'BTCUSDT,Sell,0.01,61000,610,0.3355,USDT,2026-11-01 12:00:00,o2',
      'BTCUSDT,Buy,0.01,60000,600,0.33,USDT,2026-11-01 10:00:00,o1',
    ].join('\n')
    const prep = prepareImport(UTA, bybitParser)
    expect(prep.missing).toEqual([])
    expect(prep.mode).toBe('fills')
    const trades = prep.rows.filter((r) => r.trade).map((r) => r.trade!)
    expect(trades).toHaveLength(1)
    expect(trades[0]).toMatchObject({ symbol: 'BTCUSDT', side: 'long', size_usd: 600 })
    expect(trades[0].pnl).toBeCloseTo(10 - 0.6655, 6)
  })
})

describe('направление в истории исполнений: разные написания и автоподбор колонки', () => {
  it('словарь направлений', () => {
    for (const v of ['Buy', 'BUY', 'Open Long', 'OpenLong', 'open_long', 'Close Short', 'BUY_OPEN', 'B', 'Покупка', '开多', '平空', '买入']) expect(fillSign(v), v).toBe(1)
    for (const v of ['Sell', 'SELL', 'Open Short', 'Close Long', 'close-long', 'SELL_CLOSE', 'S', 'Продажа', '开空', '平多', '卖出']) expect(fillSign(v), v).toBe(-1)
    for (const v of ['', 'Long', 'Short', 'Trade', 'Market']) expect(fillSign(v), v).toBeNull()
  })
  const tail = (dir1: string, dir2: string, extra1 = '', extra2 = '') => [
    `BTCUSDT,${dir1},0.01,60000,${extra1}2026-11-01 10:00:00,o1`,
    `BTCUSDT,${dir2},0.01,61000,${extra2}2026-11-01 12:00:00,o2`,
  ]
  it('«Long» + отдельная колонка «Open / Close» — складываются сами', () => {
    const csv = ['Market,Direction,Filled Qty,Filled Price,Trade Type,Transaction Time(UTC+0),Order No.', ...tail('Long', 'Long', 'Open,', 'Close,')].join('\n')
    const p = prepareImport(csv, bybitParser)
    expect(p.rows.filter((r) => r.error)).toEqual([])
    expect(p.rows[0].trade).toMatchObject({ side: 'long', size_usd: 600 })
  })
  it('в «Direction» непонятно, а Buy / Sell в другой колонке — она находится сама', () => {
    const csv = ['Market,Direction,Filled Qty,Filled Price,Order Side,Transaction Time(UTC+0),Order No.', ...tail('X1', 'X2', 'Buy,', 'Sell,')].join('\n')
    const p = prepareImport(csv, bybitParser)
    expect(p.rows.filter((r) => r.error)).toEqual([])
    expect(p.rows[0].trade).toMatchObject({ side: 'long' })
  })
  it('если направление так и не понять — в ошибке видно значение', () => {
    const csv = ['Market,Direction,Filled Qty,Filled Price,Transaction Time(UTC+0),Order No.', ...tail('???', '???')].join('\n')
    const p = prepareImport(csv, bybitParser)
    expect(p.rows[0]).toMatchObject({ error: 'side', detail: '???' })
  })
})

describe('направление — только «Long» / «Short» (Bybit UTA Trade History)', () => {
  const head = 'Market,Direction,Filled Qty,Filled Price,Trading Fee,feeCoin,Transaction Time(UTC+0),Order No.'
  it('Long / Short = покупка / продажа, если так позиции сходятся', () => {
    const csv = [head,
      'BTCUSDT,Long,0.01,60000,0.33,USDT,2026-11-01 10:00:00,o1',
      'BTCUSDT,Short,0.01,61000,0.3355,USDT,2026-11-01 12:00:00,o2',
      'ETHUSDT,Short,1,3000,1.65,USDT,2026-11-02 10:00:00,o3',
      'ETHUSDT,Long,1,2900,1.595,USDT,2026-11-02 12:00:00,o4',
    ].join('\n')
    const p = prepareImport(csv, bybitParser)
    expect(p.sideFallback).toBe('longIsBuy')
    const trades = p.rows.filter((r) => r.trade).map((r) => r.trade!)
    expect(trades).toHaveLength(2)
    expect(trades.find((t) => t.symbol === 'BTCUSDT')).toMatchObject({ side: 'long' })
    expect(trades.find((t) => t.symbol === 'ETHUSDT')).toMatchObject({ side: 'short' })
  })
  it('по знаку объёма, если продажи записаны с минусом', () => {
    const csv = [head,
      'BTCUSDT,Long,0.01,60000,0.33,USDT,2026-11-01 10:00:00,o1',
      'BTCUSDT,Long,-0.01,61000,0.3355,USDT,2026-11-01 12:00:00,o2',
    ].join('\n')
    const p = prepareImport(csv, bybitParser)
    expect(p.sideFallback).toBe('qtySign')
    expect(p.rows.filter((r) => r.trade)).toHaveLength(1)
  })
  it('если ни так, ни так позиции не сходятся — ничего не выдумываем', () => {
    const csv = [head,
      'BTCUSDT,Long,0.01,60000,0.33,USDT,2026-11-01 10:00:00,o1',
      'BTCUSDT,Long,0.01,61000,0.3355,USDT,2026-11-01 12:00:00,o2',
    ].join('\n')
    const p = prepareImport(csv, bybitParser)
    expect(p.sideFallback).toBeNull()
    expect(p.rows.every((r) => r.error === 'side')).toBe(true)
  })
})
