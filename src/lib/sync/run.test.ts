import { describe, expect, it } from 'vitest'
import { runSync, type SyncDeps } from './run'
import type { BybitClosedPnl } from './bybit'

const item = (orderId: string): BybitClosedPnl => ({
  symbol: 'BTCUSDT', orderId, side: 'Sell', closedSize: '0.01', cumEntryValue: '600', avgEntryPrice: '60000', cumExitValue: '610',
  avgExitPrice: '61000', closedPnl: '9.4', leverage: '10', createdTime: '1730000000000', updatedTime: String(1730000000000 + Number(orderId.slice(1))),
})

function deps(over: Partial<SyncDeps> = {}) {
  const log: { touch: [string | null, string | null][]; inserted: string[][]; expiry: (string | null)[] } = { touch: [], inserted: [], expiry: [] }
  const d: SyncDeps = {
    now: () => 1730000000000 + 3 * 86_400_000,
    cexCall: async (path, params) => {
      if (path === '/v5/user/query-api') return { retCode: 0, retMsg: 'OK', result: { readOnly: 1, expiredAt: '2027-01-01T00:00:00Z' } }
      const first = params.category === 'linear' && Number(params.endTime) >= 1730000000000
      return { retCode: 0, retMsg: 'OK', result: { list: first ? [item('o1'), item('o2'), item('o3')] : [], nextPageCursor: '' } }
    },
    existingIds: async () => new Set(['o:o1']),
    remaining: async () => null,
    insert: async ({ trades }) => {
      log.inserted.push(trades.map((t) => t.external_id))
      return { inserted: trades.length, error: null }
    },
    touch: async (c, e) => void log.touch.push([c, e]),
    setKeyExpiry: async (iso) => void log.expiry.push(iso),
    ...over,
  }
  return { d, log }
}

const conn = { id: 'c1', exchange: 'bybit', label: null, api_key: 'AbCdEf123456', cursor_at: null }

describe('runSync', () => {
  it('Bybit: новые сделки без дублей, курсор = сейчас, срок ключа сохранён', async () => {
    const { d, log } = deps()
    const r = await runSync(conn, d)
    expect(r).toEqual({ found: 3, inserted: 2, overLimit: 0 })
    expect(log.inserted).toEqual([['o:o2', 'o:o3']])
    expect(log.touch).toEqual([[new Date(d.now!()).toISOString(), null]])
    expect(log.expiry).toEqual(['2027-01-01T00:00:00Z'])
  })

  it('лимит Free: лишнее не пишем и курсор не двигаем', async () => {
    const { d, log } = deps({ remaining: async () => 1 })
    const r = await runSync(conn, d)
    expect(r).toEqual({ found: 3, inserted: 1, overLimit: 1 })
    expect(log.touch).toEqual([[null, null]])
  })

  it('ключ стал с правом торговли — ошибка, ничего не качаем', async () => {
    const { d, log } = deps({ cexCall: async () => ({ retCode: 0, retMsg: 'OK', result: { readOnly: 0 } }) })
    await expect(runSync(conn, d)).rejects.toMatchObject({ code: 'KEY_NOT_READONLY' })
    expect(log.inserted).toEqual([])
    expect(log.touch).toEqual([[null, 'KEY_NOT_READONLY']])
  })

  it('ключ отозван (10003) — ошибка KEY_INVALID сохраняется', async () => {
    const { d, log } = deps({ cexCall: async () => ({ retCode: 10003, retMsg: 'API key is invalid.', result: {} }) })
    await expect(runSync(conn, d)).rejects.toMatchObject({ code: 'KEY_INVALID' })
    expect(log.touch[0][1]).toMatch(/^KEY_INVALID \| 10003/)
  })

  it('лимит из базы (FREE_LIMIT_REACHED) — понятный код', async () => {
    const { d, log } = deps({ insert: async () => ({ inserted: 0, error: { message: 'FREE_LIMIT_REACHED' } }) })
    await expect(runSync(conn, d)).rejects.toMatchObject({ code: 'FREE_LIMIT' })
    expect(log.touch[0][1]).toBe('FREE_LIMIT')
  })
})

describe('runSync: биржи с ключом API (OKX, BingX, Bitget, Binance)', () => {
  const okxConn = { id: 'c2', exchange: 'okx', label: 'OKX', api_key: 'key-okx-1234', cursor_at: null }
  const pos = (posId: string) => ({
    instId: 'BTC-USDT-SWAP', posId, direction: 'long', type: '2', openAvgPx: '60000', closeAvgPx: '61000', closeTotalPos: '10',
    realizedPnl: '9.4', fee: '-0.6', fundingFee: '0', lever: '10', cTime: '1730000000000', uTime: '1730100000000',
  })
  const okxCall = (perm: string) => async (path: string) => {
    if (path === '/api/v5/account/config') return { code: '0', msg: '', data: [{ perm }] }
    if (path === '/api/v5/public/instruments') return { code: '0', msg: '', data: [{ instId: 'BTC-USDT-SWAP', ctVal: '0.001', ctType: 'linear' }] }
    return { code: '0', msg: '', data: [pos('p1'), pos('p2')] }
  }

  it('OKX: ключ только для чтения → сделки записаны, курсор = сейчас, срок ключа не трогаем', async () => {
    const { d, log } = deps({ cexCall: okxCall('read_only'), existingIds: async () => new Set() })
    const r = await runSync(okxConn, d)
    expect(r).toEqual({ found: 2, inserted: 2, overLimit: 0 })
    expect(log.inserted[0]).toEqual(['okx:p1:1730000000000', 'okx:p2:1730000000000'])
    expect(log.touch).toEqual([[new Date(d.now!()).toISOString(), null]])
    expect(log.expiry).toEqual([])
  })

  it('OKX: ключ с правом торговли — отказ, ничего не качаем', async () => {
    const { d, log } = deps({ cexCall: okxCall('read_only,trade') })
    await expect(runSync(okxConn, d)).rejects.toMatchObject({ code: 'KEY_NOT_READONLY' })
    expect(log.inserted).toEqual([])
  })

  it('ошибка ключа у биржи → понятный код (KEY_INVALID)', async () => {
    const { d, log } = deps({ cexCall: async () => ({ code: '50111', msg: 'Invalid OK-ACCESS-KEY', data: [] }) })
    await expect(runSync(okxConn, d)).rejects.toMatchObject({ code: 'KEY_INVALID' })
    expect(log.touch[0][1]).toMatch(/^KEY_INVALID \| 50111/)
  })

  it('неизвестная биржа — UNSUPPORTED', async () => {
    const { d } = deps()
    await expect(runSync({ ...okxConn, exchange: 'mexc' }, d)).rejects.toMatchObject({ code: 'UNSUPPORTED' })
  })
})
