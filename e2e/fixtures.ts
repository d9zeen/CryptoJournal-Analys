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
  /** админка: пользователь — админ; список пользователей; вызванные действия */
  isAdmin?: boolean
  adminUsers?: Row[]
  adminCalls?: { fn: string; body: unknown }[]
  /** подключения бирж; вызовы функций подключений и серверной функции exchange-proxy */
  connections?: Row[]
  connCalls?: { fn: string; body: Record<string, unknown> }[]
  /** ответ Bybit на проверку ключа: 1 — только чтение */
  bybitReadOnly?: number
  /** права ключа OKX (по умолчанию read_only) */
  okxPerm?: string
  /** палитра в профиле (0015) */
  palette?: string
  /** срок тарифа и пробный период в профиле (0016) */
  planUntil?: string | null
  planTrial?: boolean
  /** вход: неверный пароль (ответ 400 invalid_credentials) */
  loginFails?: boolean
  /** регистрация с подтверждением почты: signUp возвращает пользователя без сессии («Проверь почту») */
  confirmEmail?: boolean
  /** вызовы входа / регистрации / писем: путь и тело */
  authCalls?: { path: string; body: unknown }[]
  /** заметки дня в календаре (0017): день → текст; noteWrites — что сохраняли (upsert / delete) */
  dayNotes?: Record<string, string>
  /** изменения и удаления сделок (массовые действия): метод, тело, ?id=in.(…) */
  tradeWrites?: { method: string; body: unknown; ids: string[] }[]
  noteWrites?: { method: string; body: unknown }[]
  /** портфель (0019): монеты с ценами, балансы, цены входа, снимки; вызовы replace_holdings / portfolio_snapshot */
  coins?: Row[]
  holdings?: Row[]
  costs?: Row[]
  snapshots?: Row[]
  portfolioCalls?: { fn: string; body: Record<string, unknown> }[]
  /** ссылка «поделиться» (0022): своя ссылка и портфель, который отдаёт shared_portfolio */
  share?: { token: string; show_amounts: boolean } | null
  shared?: Record<string, unknown> | null
  costWrites?: { method: string; body: unknown }[]
  /** этап 2 (0020): история спотовых покупок / продаж */
  spotFills?: Row[]
  /** график сделки: какие биржи отдают свечи (по умолчанию все); куда ходил сайт */
  candleHosts?: string[]
  candleCalls?: string[]
}

/** Картинка 1×1 (иконка монеты из Storage) */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

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

    if (path === '/auth/v1/user' && method === 'PUT') {
      ;(db.authCalls ??= []).push({ path, body: body() })
      return json(session(db).user)
    }
    if (path === '/auth/v1/user') return json(session(db).user)
    if (['/auth/v1/token', '/auth/v1/signup', '/auth/v1/resend', '/auth/v1/recover'].includes(path)) (db.authCalls ??= []).push({ path, body: body() })
    if (path === '/auth/v1/token' && db.loginFails)
      return json({ code: 'invalid_credentials', error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400)
    if (path === '/auth/v1/token') return json(session(db))
    if (path === '/auth/v1/signup' && db.confirmEmail) return json({ ...session(db).user, identities: [{ id: 'x' }], confirmation_sent_at: new Date().toISOString() })
    if (path === '/auth/v1/signup') return json({ ...session(db), user: { ...session(db).user, identities: [{ id: 'x' }] } })
    if (path === '/auth/v1/resend' || path === '/auth/v1/recover') return json({})
    if (path === '/auth/v1/factors' && method === 'POST')
      return json({ id: 'f-new', type: 'totp', friendly_name: 'x', totp: { qr_code: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8"/></svg>', secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/x' } })
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204 })
    if (path.endsWith('/rpc/get_my_usage')) return json({ ...db.usage, month: '2026-11-01' })
    if (path.endsWith('/rpc/is_admin')) return json(Boolean(db.isAdmin))
    if (path.endsWith('/rpc/admin_list_users')) return db.isAdmin ? json(db.adminUsers ?? []) : json({ message: 'NOT_ADMIN', code: '42501' }, 403)
    if (path.endsWith('/rpc/admin_set_plan') || path.endsWith('/rpc/admin_reset_usage') || path.endsWith('/rpc/admin_set_admin')) {
      ;(db.adminCalls ??= []).push({ fn: path.split('/').pop()!, body: body() })
      return route.fulfill({ status: 204 })
    }
    // ---------- портфель (0019) ----------
    if (path.startsWith('/storage/v1/object/public/coin-icons/')) return route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
    if (path === '/rest/v1/portfolio_shares') return json(db.share ? [db.share] : [])
    if (path.endsWith('/rpc/share_portfolio')) {
      const b = (body() ?? {}) as { p_show_amounts?: boolean; p_new_token?: boolean }
      ;(db.portfolioCalls ??= []).push({ fn: 'share_portfolio', body: b as Record<string, unknown> })
      const token = !db.share || b.p_new_token ? `${'ab'.repeat(15)}${String((db.portfolioCalls?.length ?? 0) % 100).padStart(2, '0')}` : db.share.token
      db.share = { token, show_amounts: Boolean(b.p_show_amounts) }
      return json(token)
    }
    if (path.endsWith('/rpc/unshare_portfolio')) {
      db.share = null
      return route.fulfill({ status: 204 })
    }
    if (path.endsWith('/rpc/shared_portfolio')) {
      const b = (body() ?? {}) as { p_token?: string }
      return json(db.share && b.p_token === db.share.token ? (db.shared ?? null) : null)
    }
    if (path === '/rest/v1/coins') return json(db.coins ?? [])
    if (path === '/rest/v1/portfolio_snapshots') return json(db.snapshots ?? [])
    if (path === '/rest/v1/spot_fills') return json(db.spotFills ?? [])
    if (path === '/rest/v1/spot_sync') return json([])
    if (path.endsWith('/rpc/add_spot_fills')) {
      const b = (body() ?? {}) as Record<string, unknown>
      ;(db.portfolioCalls ??= []).push({ fn: 'add_spot_fills', body: b })
      const items = (b.p_items ?? []) as Row[]
      db.spotFills = [...(db.spotFills ?? []), ...items]
      return json(items.length)
    }
    if (path === '/rest/v1/holdings') {
      const list = (db.holdings ??= [])
      if (method === 'POST') {
        const b = body() as Row
        list.push({ id: `m${list.length + 1}`, connection_id: null, value_usd: null, note: null, updated_at: new Date().toISOString(), ...b })
        return json(null, 201)
      }
      if (method === 'DELETE') {
        const id = (url.searchParams.get('id') ?? '').replace(/^eq\./, '')
        db.holdings = list.filter((h) => h.id !== id)
        return route.fulfill({ status: 204, body: '' })
      }
      return json(list)
    }
    if (path === '/rest/v1/asset_costs') {
      const list = (db.costs ??= [])
      if (method === 'POST' || method === 'DELETE') {
        ;(db.costWrites ??= []).push({ method, body: body() })
        if (method === 'POST') {
          const b = body() as Row
          db.costs = [...list.filter((c) => c.symbol !== b.symbol), { symbol: b.symbol, avg_price: b.avg_price }]
        } else {
          const sym = (url.searchParams.get('symbol') ?? '').replace(/^eq\./, '')
          db.costs = list.filter((c) => c.symbol !== sym)
        }
        return route.fulfill({ status: method === 'POST' ? 201 : 204, body: '' })
      }
      return json(list)
    }
    if (path.endsWith('/rpc/replace_holdings') || path.endsWith('/rpc/portfolio_snapshot')) {
      const b = (body() ?? {}) as Record<string, unknown>
      ;(db.portfolioCalls ??= []).push({ fn: path.split('/').pop()!, body: b })
      if (path.endsWith('/rpc/portfolio_snapshot')) return json(null)
      const items = (b.p_items ?? []) as Row[]
      db.holdings = [
        ...(db.holdings ?? []).filter((h) => h.connection_id !== b.p_connection),
        ...items.map((it, i) => ({ id: `x${i}`, connection_id: b.p_connection, value_usd: null, note: null, updated_at: new Date().toISOString(), ...it, symbol: String(it.symbol).toUpperCase() })),
      ]
      return json(items.length)
    }
    if (path === '/rest/v1/exchange_connections') return json(db.connections ?? [])
    if (path.endsWith('_exchange_connection') || path === '/functions/v1/exchange-proxy') {
      const b = (body() ?? {}) as Record<string, unknown>
      const fn = path.split('/').pop()!
      ;(db.connCalls ??= []).push({ fn, body: b })
      const conns = (db.connections ??= [])
      if (fn === 'add_exchange_connection') {
        const id = `c${conns.length + 1}`
        conns.push({ id, exchange: b.p_exchange, label: b.p_label, api_key: b.p_exchange === 'solana' ? String(b.p_api_key).trim() : String(b.p_api_key).toLowerCase(), last_sync_at: null, cursor_at: null, last_error: null, created_at: '2026-11-05T10:00:00Z' })
        return json(id)
      }
      if (fn === 'delete_exchange_connection') {
        db.connections = conns.filter((c) => c.id !== b.p_id)
        return route.fulfill({ status: 204 })
      }
      if (fn === 'touch_exchange_connection') {
        const c = conns.find((x) => x.id === b.p_id)
        if (c) Object.assign(c, { last_sync_at: new Date().toISOString(), cursor_at: b.p_cursor ?? c.cursor_at, last_error: b.p_error })
        return route.fulfill({ status: 204 })
      }
      // exchange-proxy: Polymarket — закрытые позиции
      if (b.path === '/v2/positions')
        return json({
          data: [{ conditionId: '0xabcdef0123456789', title: 'Will BTC hit 150k in 2026?', outcome: 'Yes', avgPrice: 0.4, totalBought: 100, realizedPnl: 60, timestamp: 1793000000 }],
          pagination: { next_cursor: null },
        })
      const params = (b.params ?? {}) as Record<string, number | string>
      // exchange-proxy: ответы OKX (права ключа, инструменты, закрытые позиции)
      if (b.path === '/api/v5/account/config') return json({ code: '0', msg: '', data: [{ perm: db.okxPerm ?? 'read_only' }] })
      if (b.path === '/api/v5/public/instruments') return json({ code: '0', msg: '', data: [{ instId: 'BTC-USDT-SWAP', ctVal: '0.01', ctType: 'linear' }] })
      if (b.path === '/api/v5/account/positions-history') {
        const t = String(Date.now() - 3_600_000)
        const pos = { instId: 'BTC-USDT-SWAP', posId: 'okx-1', direction: 'long', type: '2', openAvgPx: '60000', closeAvgPx: '61000', closeTotalPos: '3', realizedPnl: '29.1', fee: '-0.72', fundingFee: '-0.18', lever: '10', cTime: t, uTime: t }
        return json({ code: '0', msg: '', data: Number(params.after) > Date.now() - 60_000 ? [pos] : [] })
      }
      // exchange-proxy: спотовые покупки Bybit (портфель, этап 2) — одна покупка BTC в последнем окне
      if (b.path === '/v5/execution/list' && params.category === 'spot') {
        const t = Date.now() - 2 * 86_400_000
        const inWindow = Number(params.startTime) <= t && t <= Number(params.endTime)
        const item = { symbol: 'BTCUSDT', side: 'Buy', execQty: '0.25', execPrice: '80000', execFee: '0', execId: 'spot-1', execTime: String(t) }
        return json({ retCode: 0, retMsg: 'OK', result: { list: inWindow ? [item] : [], nextPageCursor: '' } })
      }
      // exchange-proxy: балансы Bybit (портфель)
      if (b.path === '/v5/account/wallet-balance')
        // единый счёт: 5 000 USDT — маржа фьючерсов, в спотовый портфель не идут
        return json({ retCode: 0, retMsg: 'OK', result: { list: [{ coin: [{ coin: 'BTC', equity: '0.25' }, { coin: 'USDT', equity: '5000' }, { coin: 'SHIB', equity: '10' }] }] } })
      if (b.path === '/v5/asset/transfer/query-account-coins-balance')
        return json({ retCode: 0, retMsg: 'OK', result: { balance: [{ coin: 'ETH', walletBalance: '2' }, { coin: 'USDT', walletBalance: '1200.5' }] } })
      if (b.path === '/v5/earn/position') return json({ retCode: 0, retMsg: 'OK', result: { list: [] } })
      // exchange-proxy: ответы Bybit
      if (b.path === '/v5/user/query-api') return json({ retCode: 0, retMsg: 'OK', result: { readOnly: db.bybitReadOnly ?? 1 } })
      const recent = params.category === 'linear' && Number(params.endTime) > Date.now() - 7 * 86_400_000 && !params.cursor
      const item = { symbol: 'ETHUSDT', orderId: 'bb-1', side: 'Buy', closedSize: '1', cumEntryValue: '3000', avgEntryPrice: '3000', cumExitValue: '2900', avgExitPrice: '2900', closedPnl: '98', leverage: '5', createdTime: String(Date.now() - 3_600_000), updatedTime: String(Date.now() - 3_600_000) }
      return json({ retCode: 0, retMsg: 'OK', result: { list: recent ? [item] : [], nextPageCursor: '' } })
    }
    if (path === '/rest/v1/profiles') {
      if (method === 'PATCH') {
        const b = JSON.parse(req.postData() || '{}')
        if (b.palette) db.palette = b.palette
      }
      return json({ id: UID, display_name: null, plan: db.usage.plan, plan_until: db.planUntil ?? null, plan_trial: db.planTrial ?? false, timezone: 'Europe/Moscow', starting_balance: 5000, locale: 'ru', palette: db.palette ?? 'classic' })
    }
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
        // фильтр по дате входа, как у настоящего Supabase: entry_at=gte.… и entry_at=lt.…
        const conds = url.searchParams.getAll('entry_at')
        const rows = db.trades.filter((t) =>
          conds.every((c) => {
            const [op, v] = [c.slice(0, c.indexOf('.')), c.slice(c.indexOf('.') + 1)]
            const at = Date.parse(String(t.entry_at))
            return op === 'gte' ? at >= Date.parse(v) : op === 'lt' ? at < Date.parse(v) : true
          }),
        )
        const page = rows.slice(offset, offset + limit)
        const total = rows.length
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
      // массовые действия: PATCH / DELETE с ?id=in.(a,b,…) — применяем к db.trades, как база
      const m = /^in\.\((.*)\)$/.exec(url.searchParams.get('id') ?? '')
      const ids = m ? m[1].split(',').map((x) => x.replace(/"/g, '')) : []
      ;(db.tradeWrites ??= []).push({ method, body: body(), ids })
      if (method === 'PATCH' && ids.length) {
        const b = body() as Record<string, unknown>
        db.trades = db.trades.map((t) => (ids.includes(String(t.id)) ? { ...t, ...b } : t))
      }
      if (method === 'DELETE' && ids.length) db.trades = db.trades.filter((t) => !ids.includes(String(t.id)))
      return route.fulfill({ status: 204, body: '' })
    }
    if (path === '/rest/v1/day_notes') {
      const notes = (db.dayNotes ??= {})
      const row = (day: string) => ({ id: `note-${day}`, user_id: UID, day, text: notes[day], created_at: '', updated_at: '' })
      if (method === 'GET') {
        const day = url.searchParams.get('day')?.replace(/^eq\./, '')
        if (day) return json(notes[day] !== undefined ? row(day) : null)
        return json(Object.keys(notes).map(row))
      }
      ;(db.noteWrites ??= []).push({ method, body: body() })
      if (method === 'POST') {
        const b = body() as { day: string; text: string }
        // как триггер в базе: записать заметку — только Pro Plus
        if (db.usage.plan !== 'pro_plus') return json({ message: 'PLAN_FEATURE', code: 'P0001' }, 400)
        notes[b.day] = b.text
        return json(row(b.day), 201)
      }
      if (method === 'DELETE') {
        const day = url.searchParams.get('day')?.replace(/^eq\./, '')
        if (day) delete notes[day]
        return route.fulfill({ status: 204, body: '' })
      }
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
  // свечи для графика сделки (lib/candles.ts): цена около 100 на любое окно; биржа не из candleHosts — 503
  await page.route(/^https:\/\/(api\.bybit\.com|api\.binance\.com|fapi\.binance\.com|www\.okx\.com)\//, async (route) => {
    const url = new URL(route.request().url())
    ;(db.candleCalls ??= []).push(url.href)
    if (db.candleHosts && !db.candleHosts.includes(url.hostname)) return route.fulfill({ status: 503, body: '' })
    const q = url.searchParams
    const ivMs: Record<string, number> = { '1': 6e4, '1m': 6e4, '5': 3e5, '5m': 3e5, '15': 9e5, '15m': 9e5, '60': 36e5, '1h': 36e5, '1H': 36e5, '240': 144e5, '4h': 144e5, '4H': 144e5, D: 864e5, '1d': 864e5, '1Dutc': 864e5 }
    const ms = ivMs[q.get('interval') ?? q.get('bar') ?? '1m'] ?? 6e4
    const from = Number(q.get('start') ?? q.get('startTime') ?? 0)
    const to = Number(q.get('end') ?? q.get('endTime') ?? q.get('after') ?? 0)
    const rows: string[][] = []
    for (let t = Math.ceil(from / ms) * ms; t < to && rows.length < 1000; t += ms) {
      // похоже на рынок: сумма волн разной длины (детерминированно по времени — одинаково на любом окне)
      const p = (x: number) => 100 + Math.sin(x / 9) * 1.2 + Math.sin(x / 2.7 + 1) * 0.45 + Math.sin(x / 1.1 + 2) * 0.2
      const o = p(t / ms)
      const c = p(t / ms + 1)
      rows.push([String(t), o.toFixed(2), (Math.max(o, c) + 0.3).toFixed(2), (Math.min(o, c) - 0.3).toFixed(2), c.toFixed(2)])
    }
    const body = url.hostname === 'api.bybit.com' ? { retCode: 0, result: { list: rows.reverse() } } : url.hostname === 'www.okx.com' ? { code: '0', data: [] } : rows
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) })
  })
  if (signedIn) await page.addInitScript((s) => localStorage.setItem('sb-fake-auth-token', JSON.stringify(s)), session(db))
}

/** Тест с фейковой базой и автоматической проверкой: нет ошибок JS и нарушений CSP */
/**
 * lang — язык сайта в тесте. Сайт по умолчанию на английском, а большинство тестов сверяет русские тексты,
 * поэтому по умолчанию ставим 'ru' (только если язык ещё не выбран — переключение в самом тесте сохраняется).
 * null — ничего не ставить: сайт откроется на языке по умолчанию (английском). test.use({ lang: null })
 */
export const test = base.extend<{ db: FakeDb; lang: 'ru' | 'en' | null }>({
  lang: ['ru', { option: true }],
  context: async ({ context, lang }, use) => {
    if (lang)
      await context.addInitScript((l) => {
        try {
          if (!localStorage.getItem('cj-lang')) localStorage.setItem('cj-lang', l)
        } catch {
          /* нет хранилища */
        }
      }, lang)
    await use(context)
  },
  db: async ({ page }, use) => {
    const db: FakeDb = { trades: [], imports: [], inserted: [], factors: [], aal: 'aal1', usage: { plan: 'free', trades_created: 3, trade_limit: 50 } }
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
