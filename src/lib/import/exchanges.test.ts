import { describe, expect, it } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { parserFor } from './registry'
import { prepareImport } from './plan'
import { readXlsx, excelDate } from './xlsx'
import { fillSign, positionSide, sideMeaningFromHeader, feeToUsd } from './fields'

const p = (ex: string) => parserFor(ex)!
const trades = (rows: ReturnType<typeof prepareImport>['rows']) => rows.filter((r) => r.trade).map((r) => r.trade!)

describe('направление', () => {
  it('fillSign: buy/sell и open/close long/short', () => {
    expect(fillSign('BUY')).toBe(1)
    expect(fillSign('Sell')).toBe(-1)
    expect(fillSign('Open long')).toBe(1)
    expect(fillSign('close_long')).toBe(-1)
    expect(fillSign('Open Short')).toBe(-1)
    expect(fillSign('Close short')).toBe(1)
    expect(fillSign('???')).toBeNull()
  })
  it('positionSide: Buy = long при «открытии», Sell = long при «закрытии»', () => {
    expect(positionSide('Buy', 'opening')).toBe('long')
    expect(positionSide('Buy', 'closing')).toBe('short')
    expect(positionSide('Long', 'closing')).toBe('long')
  })
  it('заголовок колонки важнее настройки биржи', () => {
    expect(sideMeaningFromHeader('Closing Direction', 'opening')).toBe('closing')
    expect(sideMeaningFromHeader('Position Side', 'closing')).toBe('opening')
    expect(sideMeaningFromHeader('Side', 'closing')).toBe('closing')
  })
  it('комиссия в разных монетах', () => {
    expect(feeToUsd(-0.5, 'USDT', 'BTCUSDT', 60000, 'linear')).toBe(0.5)
    expect(feeToUsd(0.00001, 'BTC', 'BTCUSDT', 60000, 'spot')).toBeCloseTo(0.6)
    expect(feeToUsd(0.001, 'BNB', 'BTCUSDT', 60000, 'linear')).toBeNull()
  })
})

// Binance USDT-M Futures → Trade History (строка = исполнение), новые сверху
const BINANCE_FUTURES = [
  'Date(UTC),Symbol,Side,Price,Quantity,Amount,Fee,Realized Profit',
  '2026-11-02 12:00:00,ETHUSDT,BUY,2900,1,2900,1.16USDT,100',
  '2026-11-02 10:00:00,ETHUSDT,SELL,3000,1,3000,1.2USDT,0',
  '2026-11-01 13:00:00,BTCUSDT,SELL,61000,0.006,366,0.1464USDT,6',
  '2026-11-01 12:00:00,BTCUSDT,SELL,62000,0.004,248,0.0992USDT,8',
  '2026-11-01 11:00:00,BTCUSDT,BUY,60000,0.005,300,0.12USDT,0',
  '2026-11-01 10:00:00,BTCUSDT,BUY,60000,0.005,300,0.12USDT,0',
].join('\n')

describe('Binance Futures: история исполнений → сделки', () => {
  const prep = prepareImport(BINANCE_FUTURES, p('binance'))
  const btc = trades(prep.rows).find((t) => t.symbol === 'BTCUSDT')!
  const eth = trades(prep.rows).find((t) => t.symbol === 'ETHUSDT')!

  it('понял формат: история исполнений, колонки найдены, время в UTC', () => {
    expect(prep.mode).toBe('fills')
    expect(prep.missing).toEqual([])
    expect(prep.offsetDetected).toBe(true)
  })
  it('BTC: две покупки + два частичных закрытия = одна long-сделка со средними ценами', () => {
    expect(btc).toMatchObject({ exchange: 'binance', symbol: 'BTCUSDT', side: 'long', market_type: 'linear', size_usd: 600, entry_price: 60000 })
    expect(btc.exit_price).toBeCloseTo((0.004 * 62000 + 0.006 * 61000) / 0.01, 6)
    expect(btc.entry_at).toBe('2026-11-01T10:00:00.000Z')
    expect(btc.exit_at).toBe('2026-11-01T13:00:00.000Z')
    expect(btc.fee).toBeCloseTo(0.12 + 0.12 + 0.0992 + 0.1464, 8)
    // Realized Profit у Binance — до комиссий: 8 + 6 = 14 валовых
    expect(btc.pnl).toBeCloseTo(14 - btc.fee, 6)
    expect(btc.pnl_manual).toBe(false)
  })
  it('ETH: продажа, затем покупка = short', () => {
    expect(eth).toMatchObject({ symbol: 'ETHUSDT', side: 'short', entry_price: 3000, exit_price: 2900, size_usd: 3000 })
    expect(eth.pnl).toBeCloseTo(100 - 2.36, 6)
  })
  it('строки позиции в файле и стабильный id', () => {
    const r = prep.rows.find((x) => x.trade?.symbol === 'BTCUSDT')!
    expect([r.line, r.lineTo]).toEqual([4, 7])
    expect(trades(prepareImport(BINANCE_FUTURES, p('binance')).rows).find((t) => t.symbol === 'BTCUSDT')!.external_id).toBe(btc.external_id)
  })
})

describe('история исполнений: разворот, незакрытая позиция, посторонняя монета', () => {
  const CSV = [
    'Time,Symbol,Side,Price,Qty,Fee,Fee Coin',
    '2026-11-01 10:00,SOLUSDT,Buy,100,10,0.4,USDT',
    '2026-11-01 11:00,SOLUSDT,Sell,110,15,0.6,USDT', // закрыл 10 и открыл шорт на 5
    '2026-11-01 12:00,SOLUSDT,Buy,105,5,0.2,USDT', // закрыл шорт
    '2026-11-01 13:00,XRPUSDT,Buy,0.5,100,0.001,BNB', // так и не закрыта
  ].join('\n')
  const prep = prepareImport(CSV, p('bybit'))
  const ts = trades(prep.rows)

  it('разворот делит исполнение и комиссию на две сделки', () => {
    expect(ts).toHaveLength(2)
    expect(ts[0]).toMatchObject({ side: 'long', entry_price: 100, exit_price: 110, size_usd: 1000 })
    expect(ts[0].fee).toBeCloseTo(0.4 + 0.4, 8)
    expect(ts[0].pnl).toBeCloseTo(100 - 0.8, 6)
    expect(ts[1]).toMatchObject({ side: 'short', entry_price: 110, exit_price: 105, size_usd: 550 })
    expect(ts[1].fee).toBeCloseTo(0.2 + 0.2, 8)
  })
  it('незакрытая позиция — не импортируем, сообщаем', () => {
    expect(prep.rows.find((r) => r.error)).toMatchObject({ line: 5, error: 'stillOpen' })
  })
})

describe('спот (Binance Spot Trade History)', () => {
  const CSV = [
    'Date(UTC),Pair,Side,Price,Executed,Amount,Fee',
    '2026-11-01 09:00:00,BTCUSDT,SELL,59000,0.002BTC,118USDT,0.118USDT', // продажа без покупки в файле
    '2026-11-01 10:00:00,BTCUSDT,BUY,60000,0.01BTC,600USDT,0.00001BTC',
    '2026-11-01 12:00:00,BTCUSDT,SELL,63000,0.01BTC,630USDT,0.63USDT',
  ].join('\n')
  const prep = prepareImport(CSV, p('binance'), { market: 'spot' })

  it('long-сделка, комиссия в BTC переведена в $', () => {
    const [t] = trades(prep.rows)
    expect(t).toMatchObject({ market_type: 'spot', side: 'long', leverage: 1, size_usd: 600, exit_price: 63000 })
    expect(t.fee).toBeCloseTo(0.6 + 0.63, 8)
    expect(t.pnl).toBeCloseTo(30 - 1.23, 6)
  })
  it('продажа монет, купленных до начала файла, — пропускаем', () => {
    expect(prep.rows.find((r) => r.error)).toMatchObject({ line: 2, error: 'spotNoBuy' })
  })
})

describe('закрытые позиции других бирж', () => {
  it('OKX Position History: направление Long/Short, время открытия и закрытия', () => {
    const CSV = [
      'Instrument,Margin mode,Leverage,Position direction,Avg. open price,Avg. close price,Closed amount,Realized PnL,Fee,Opened,Closed',
      'BTC-USDT-SWAP,cross,10,short,62000,61000,0.01,9.38,-0.62,2026-11-01 10:00:00,2026-11-01 14:00:00',
    ].join('\n')
    const prep = prepareImport(CSV, p('okx'))
    expect(prep.mode).toBe('positions')
    expect(prep.missing).toEqual([])
    const [t] = trades(prep.rows)
    expect(t).toMatchObject({ exchange: 'okx', symbol: 'BTC-USDT-SWAP', market_type: 'linear', side: 'short', leverage: 10, size_usd: 620, fee: 0.62 })
    expect(t.pnl).toBeCloseTo(9.38, 8)
  })
  it('coin-M у OKX (BTC-USD-SWAP) — инверсный', () => {
    const CSV = 'Instrument,Position direction,Avg. open price,Avg. close price,Closed amount,Closed\nBTC-USD-SWAP,long,60000,62000,1000,2026-11-01 14:00'
    expect(trades(prepareImport(CSV, p('okx')).rows)[0].market_type).toBe('inverse')
  })
  it('BingX: Buy в колонке позиции = long', () => {
    const CSV = 'Symbol,Side,Avg Open Price,Avg Close Price,Position Size,Realized PnL,Open Time,Close Time\nSOL-USDT,Buy,100,90,5,-50,2026-11-01 10:00,2026-11-01 11:00'
    const [t] = trades(prepareImport(CSV, p('bingx')).rows)
    expect(t).toMatchObject({ side: 'long', size_usd: 500 })
    expect(t.pnl).toBeCloseTo(-50, 8)
  })
  it('не понятно, что за файл — просим колонки цен', () => {
    const prep = prepareImport('Symbol,Side\nBTCUSDT,Buy', p('other'))
    expect(prep.mode).toBeNull()
    expect(prep.missing).toEqual(['qty', 'entryPrice', 'exitPrice', 'closeTime'])
  })
})

describe('Excel (.xlsx)', () => {
  const sheet = `<?xml version="1.0"?><worksheet><sheetData>
    <row r="1"><c r="A1" t="inlineStr"><is><t>Trade History</t></is></c></row>
    <row r="2"><c r="A2" t="s"><v>0</v></c><c r="B2" t="s"><v>1</v></c><c r="C2" t="s"><v>2</v></c><c r="D2" t="s"><v>3</v></c><c r="E2" t="s"><v>4</v></c></row>
    <row r="3"><c r="A3" s="1"><v>46327.4166666667</v></c><c r="B3" t="s"><v>5</v></c><c r="C3" t="s"><v>6</v></c><c r="D3"><v>60000</v></c><c r="E3"><v>0.01</v></c></row>
    <row r="4"><c r="A4" s="1"><v>46327.5</v></c><c r="B4" t="s"><v>5</v></c><c r="C4" t="s"><v>7</v></c><c r="D4"><v>61000</v></c><c r="E4"><v>0.01</v></c></row>
  </sheetData></worksheet>`
  const shared = `<sst><si><t>Date(UTC)</t></si><si><t>Symbol</t></si><si><t>Side</t></si><si><r><t>Pri</t></r><r><t>ce</t></r></si><si><t>Quantity</t></si><si><t>BTCUSDT</t></si><si><t>BUY</t></si><si><t>SELL &amp; close</t></si></sst>`
  const styles = `<styleSheet><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="22" applyNumberFormat="1"/></cellXfs></styleSheet>`
  const xlsx = zipSync({
    'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
    'xl/sharedStrings.xml': strToU8(shared),
    'xl/styles.xml': strToU8(styles),
  })

  it('читает лист: пропускает заголовок отчёта, строки, даты, «прогоны» текста и &amp;', () => {
    const t = readXlsx(xlsx)
    expect(t.headers).toEqual(['Date(UTC)', 'Symbol', 'Side', 'Price', 'Quantity'])
    expect(t.rows[0]).toEqual(['2026-11-01 10:00:00', 'BTCUSDT', 'BUY', '60000', '0.01'])
    expect(t.rows[1][2]).toBe('SELL & close')
  })
  it('и сразу импортируется', () => {
    const [tr] = trades(prepareImport(readXlsx(xlsx), p('binance')).rows)
    expect(tr).toMatchObject({ side: 'long', entry_price: 60000, exit_price: 61000, size_usd: 600, exit_at: '2026-11-01T12:00:00.000Z' })
  })
  it('excelDate', () => {
    expect(excelDate(46327)).toBe('2026-11-01 00:00:00')
  })
})
