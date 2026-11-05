import { describe, expect, it } from 'vitest'
import { createHmac } from 'node:crypto'
import { buildQuery, bybitSignature, BYBIT_READ_PATHS } from './sign'

describe('прокси бирж: подпись Bybit', () => {
  it('HMAC-SHA256 в hex — как у Bybit', async () => {
    const payload = '1672211928338' + 'XXXXXXXXXX' + '5000' + 'category=linear&limit=100'
    const expected = createHmac('sha256', 'YYYYYYYYYY').update(payload).digest('hex')
    expect(await bybitSignature('YYYYYYYYYY', payload)).toBe(expected)
  })
  it('в запрос попадают только разрешённые параметры', () => {
    expect(buildQuery({ category: 'linear', startTime: 1, endTime: 2, limit: 100, cursor: 'a b', evil: 'x', symbol: '' })).toBe(
      'category=linear&startTime=1&endTime=2&limit=100&cursor=a%20b',
    )
    expect(buildQuery({ category: { x: 1 } })).toBe('')
  })
  it('только адреса для чтения', () => {
    expect(BYBIT_READ_PATHS.has('/v5/position/closed-pnl')).toBe(true)
    expect(BYBIT_READ_PATHS.has('/v5/order/create')).toBe(false)
  })
})
