// 0024: номер аккаунта биржи при проверке ключа — один аккаунт, одно подключение (иначе деньги и сделки считались бы дважды)
import { describe, expect, it } from 'vitest'
import { checkBybitKey, type BybitCall } from './bybit'
import { checkOkxKey } from './okx'
import { checkBitgetKey } from './bitget'
import { checkBinanceKey } from './binance'
import { uidOf } from './cex'

describe('номер аккаунта из проверки ключа', () => {
  it('Bybit — userID из query-api', async () => {
    const call = (async () => ({ retCode: 0, retMsg: 'OK', result: { readOnly: 1, userID: 533285 } })) as unknown as BybitCall
    expect(await checkBybitKey(call)).toMatchObject({ readOnly: true, uid: '533285' })
  })
  it('OKX — uid из account/config', async () => {
    const call = async () => ({ code: '0', msg: '', data: [{ perm: 'read_only', uid: '44705892343619584' }] })
    expect(await checkOkxKey(call)).toMatchObject({ readOnly: true, uid: '44705892343619584' })
  })
  it('Bitget — userId (единый аккаунт и классический)', async () => {
    const uta = async () => ({ code: '00000', data: { permType: 'read-only', userId: '1234567' } })
    expect(await checkBitgetKey(uta)).toMatchObject({ readOnly: true, uid: '1234567' })
    const classic = async (path: string) =>
      path === '/api/v3/account/info' ? { code: '40084', msg: 'not uta' } : { code: '00000', data: { authorities: ['readonly'], userId: '765' } }
    expect(await checkBitgetKey(classic)).toMatchObject({ readOnly: true, uid: '765' })
  })
  it('Binance — uid из /api/v3/account; не ответил — без номера, ключ всё равно проверен', async () => {
    const ok = async (path: string) => (path === '/sapi/v1/account/apiRestrictions' ? { enableReading: true, enableSpotAndMarginTrading: false } : { uid: 354937868 })
    expect(await checkBinanceKey(ok)).toMatchObject({ readOnly: true, uid: '354937868' })
    const noAccount = async (path: string) => (path === '/sapi/v1/account/apiRestrictions' ? { enableReading: true } : { code: -2015, msg: 'no' })
    expect(await checkBinanceKey(noAccount)).toMatchObject({ readOnly: true, uid: null })
  })
  it('мусор вместо номера — без номера', () => {
    expect(uidOf(0)).toBeNull()
    expect(uidOf('')).toBeNull()
    expect(uidOf({})).toBeNull()
    expect(uidOf('x'.repeat(65))).toBeNull()
    expect(uidOf(' 42 ')).toBe('42')
  })
})
