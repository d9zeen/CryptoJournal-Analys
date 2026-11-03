import { describe, expect, it } from 'vitest'
import { csvCell, exportFilename, tradesToCsv, CSV_COLUMNS } from './tradesCsv'
import { parseCsv } from '@/lib/import/csv'
import type { TradeWithTags } from '@/types/db'

const trade: TradeWithTags = {
  id: 't1', user_id: 'u', exchange: 'bybit', market_type: 'linear', symbol: 'BTCUSDT', side: 'long',
  entry_at: '2026-11-01T10:00:00.000Z', exit_at: '2026-11-01T12:00:00.000Z',
  entry_price: 60000, exit_price: 61000, size_usd: 600, leverage: 10, fee: 0.66, funding: -0.1,
  stop_loss: 59000, take_profit: null, pnl: 9.24, pnl_manual: false, r_multiple: 0.924,
  setup_id: 's1', emotion_id: null, note: 'Вход по "плану"; вышел рано\nвторая строка', screenshot_path: null,
  source: 'manual', import_id: null, external_id: null, created_at: '2026-11-01T12:01:00.000Z', updated_at: '',
  trade_mistakes: [{ tag_id: 'm1' }, { tag_id: 'm2' }],
}
const names = {
  setups: new Map([['s1', 'Пробой уровня']]),
  emotions: new Map<string, string>(),
  tags: new Map([['m1', 'FOMO'], ['m2', 'Ранний выход']]),
}

describe('tradesToCsv', () => {
  const csv = tradesToCsv([trade], names)

  it('BOM, заголовок и строка; CRLF', () => {
    expect(csv.startsWith('﻿id;exchange;')).toBe(true)
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(2)
  })
  it('читается обратно нашим же парсером CSV — значения не теряются', () => {
    const t = parseCsv(csv)
    expect(t.headers).toEqual([...CSV_COLUMNS])
    const row = Object.fromEntries(t.headers.map((h, i) => [h, t.rows[0][i]]))
    expect(row).toMatchObject({
      symbol: 'BTCUSDT', side: 'long', entry_price: '60000', funding: '-0.1', take_profit: '',
      setup: 'Пробой уровня', emotion: '', mistakes: 'FOMO | Ранний выход',
      note: 'Вход по "плану"; вышел рано\nвторая строка', pnl_manual: 'false',
    })
  })
})

describe('csvCell', () => {
  it('кавычки только когда нужно', () => {
    expect(csvCell('abc')).toBe('abc')
    expect(csvCell('a;b')).toBe('"a;b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell(null)).toBe('')
    expect(csvCell(-12.5)).toBe('-12.5')
  })
  it('текст-формулы для Excel обезврежены', () => {
    expect(csvCell('=HYPERLINK("x")', true)).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvCell('+7', true)).toBe("'+7")
    expect(csvCell('-cmd', true)).toBe("'-cmd")
    expect(csvCell('-5% стоп', true)).toBe('-5% стоп')
  })
})

it('exportFilename', () => {
  expect(exportFilename(new Date(2026, 10, 3))).toBe('cryptojournal-trades-2026-11-03.csv')
})
