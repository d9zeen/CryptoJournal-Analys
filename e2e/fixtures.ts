/**
 * Фейковый Supabase для сквозных тестов: отвечает на запросы сайта из памяти.
 * Плюс проверка, что на странице не было ошибок JavaScript и нарушений CSP.
 */
import { test as base, expect, type Page } from '@playwright/test'

export const UID = '11111111-1111-1111-1111-111111111111'
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')

type Row = Record<string, unknown>
export type FakeDb = {
  trades: Row[]
  imports: Row[]
  inserted: { table: string; body: unknown }[]
  factors: Row[]
  aal: 'aal1' | 'aal2'
  usage: { plan: string; trades_created: number; trade_limit: number | null }
  /** названия сетапов / эмоций / тегов (по умолчанию — один «Пробой уровня») */
  listNames?: string[]
}

export function makeTrade(i: number, over: Row = {}): Row {
  const entry = new Date(Date.UTC(2026, 8, 1 + i, 10)).toISOString()
  const exit = new Date(Date.UTC(2026, 8, 1 + i, 14)).toISOString()
  const pnl = i % 3 === 0 ? -40 - i : 60 + i
  return {
    id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`, user_id: UID, exchange: 'bybit', market_type: 'linear',
    symbol: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'][i % 3], side: i % 2 ? 'short' : 'long', entry_at: entry, exit_at: exit,
    entry_price: 100, exit_price: 101, size_usd: 1000, leverage: 5, fee: 1, funding: 0, stop_loss: 99, take_profit: null,
    pnl, pnl_manual: false, r_multiple: pnl / 10, setup_id: 's1', emotion_id: null, note: null, screenshot_path: null,
    source: 'manual', import_id: null, external_id: null, created_at: entry, updated_at: entry, trade_mistakes: [], trade_screenshots: [],
    ...over,
  }
}

function session(db: FakeDb) {
  const exp = Math.floor(Date.now() / 1000) + 86400
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, exp, role: 'authenticated', aal: db.aal, amr: [{ method: 'password', timestamp: 1 }] })}.sig`
  const user = { id: UID, email: 'trader@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z', factors: db.factors }
  return { access_token: jwt, refresh_token: 'r', expires_at: exp, expires_in: 86400, token_type: 'bearer', user }
}

/** Подключить фейковый Supabase к странице; signedIn — положить сессию заранее */
export async function fakeSupabase(page: Page, db: FakeDb, { signedIn = true } = {}) {
  await page.route('https://fake.supabase.test/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname
    const method = req.method()
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    const body = () => { try { return JSON.parse(req.postData() ?? 'null') } catch { return null } }

    if (path === '/auth/v1/user') return json(session(db).user)
    if (path === '/auth/v1/token') return json(session(db))
    if (path === '/auth/v1/signup') return json({ ...session(db), user: { ...session(db).user, identities: [{ id: 'x' }] } })
    if (path === '/auth/v1/factors' && method === 'POST')
      return json({ id: 'f-new', type: 'totp', friendly_name: 'x', totp: { qr_code: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8"/></svg>', secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/x' } })
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204 })
    if (path.endsWith('/rpc/get_my_usage')) return json({ ...db.usage, month: '2026-11-01' })
    if (path === '/rest/v1/profiles') return json({ id: UID, display_name: null, plan: db.usage.plan, plan_until: null, timezone: 'Europe/Moscow', starting_balance: 5000, locale: 'ru' })
    if (['/rest/v1/setups', '/rest/v1/emotions', '/rest/v1/mistake_tags'].includes(path)) {
      const names = db.listNames ?? ['Пробой уровня']
      return json(names.map((name, i) => ({ id: i === 0 ? 's1' : `s${i + 1}`, user_id: UID, name, archived: false, sort_order: i, created_at: '' })))
    }
    if (path === '/rest/v1/trades') {
      if (method === 'GET') {
        if (url.searchParams.get('external_id')) return json([]) // проверка дублей при импорте
        if (url.searchParams.get('id')) return json(db.trades.find((t) => `eq.${t.id}` === url.searchParams.get('id')) ?? null)
        // как настоящий Supabase: не больше 1000 строк за раз (offset/limit) и общее число в Content-Range
        const offset = Number(url.searchParams.get('offset') ?? 0)
        const limit = Math.min(Number(url.searchParams.get('limit') ?? 1000), 1000)
        const page = db.trades.slice(offset, offset + limit)
        const total = db.trades.length
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: {
            'content-range': `${page.length ? `${offset}-${offset + page.length - 1}` : '*'}/${total}`,
            'access-control-expose-headers': 'Content-Range',
            'access-control-allow-origin': '*',
          },
          body: JSON.stringify(page),
        })
      }
      if (method === 'POST') {
        const b = body()
        db.inserted.push({ table: 'trades', body: b })
        for (const row of Array.isArray(b) ? b : [b]) db.trades.push(makeTrade(db.trades.length + 100, row))
        return route.fulfill({ status: 201, body: '' })
      }
      return route.fulfill({ status: 204, body: '' })
    }
    if (path === '/rest/v1/imports') {
      if (method === 'POST') {
        const rec = { id: 'imp-1', created_at: new Date().toISOString(), rows_imported: 0, rows_skipped: 0, ...body() }
        db.imports.push(rec)
        return json(rec, 201)
      }
      if (method === 'PATCH') {
        Object.assign(db.imports[0] ?? {}, body())
        return route.fulfill({ status: 204, body: '' })
      }
      return json(db.imports)
    }
    if (method === 'POST' || method === 'PATCH' || method === 'DELETE') {
      db.inserted.push({ table: path, body: body() })
      return route.fulfill({ status: method === 'POST' ? 201 : 204, body: '' })
    }
    return json([])
  })
  if (signedIn) await page.addInitScript((s) => localStorage.setItem('sb-fake-auth-token', JSON.stringify(s)), session(db))
}

/** Тест с фейковой базой и автоматической проверкой: нет ошибок JS и нарушений CSP */
export const test = base.extend<{ db: FakeDb }>({
  db: async ({ page }, use) => {
    const db: FakeDb = { trades: [], imports: [], inserted: [], factors: [], aal: 'aal1', usage: { plan: 'free', trades_created: 3, trade_limit: 30 } }
    const problems: string[] = []
    page.on('pageerror', (e) => problems.push(`JS: ${e.message}`))
    page.on('console', (m) => {
      if (/Content Security Policy|Refused to/i.test(m.text())) problems.push(`CSP: ${m.text()}`)
    })
    await use(db)
    expect(problems, 'ошибки на странице').toEqual([])
  },
})
export { expect }
