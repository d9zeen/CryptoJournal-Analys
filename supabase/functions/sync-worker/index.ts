/**
 * sync-worker — синхронизация подключения биржи на сервере, по расписанию (как TradeZella: каждые 3 часа, тариф Pro Plus).
 *
 * Кто вызывает: только база (pg_cron → public.dispatch_sync → pg_net) с секретом из Vault в заголовке x-sync-secret.
 * Из браузера вызвать нельзя: без секрета — 403 (JWT здесь не нужен, verify_jwt = false).
 * Права service_role: подключение, секрет ключа (Vault) и запись сделок — от имени владельца подключения (user_id явно).
 * Лимиты и проверки данных по-прежнему делает база (триггеры на trades).
 *
 * Логика синхронизации — общая с браузером: engine.js собирается из src/lib/sync (npm run build:functions).
 * Выкладка: Supabase → Edge Functions → sync-worker (файлы index.ts + engine.js), verify_jwt = false.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { buildQuery, bybitSignature, runSync } from './engine.js'

const BYBIT = 'https://api.bybit.com'
const RECV_WINDOW = '10000'
const READ_PATHS = new Set(['/v5/position/closed-pnl', '/v5/user/query-api'])
const ID_CHUNK = 150
const CHUNK = 500

type Row = Record<string, unknown>
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const chunks = <T,>(arr: T[], size: number): T[][] => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, (i + 1) * size))

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'METHOD' }, 405)
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  // 1. Вызов только от базы: секрет совпадает с секретом в Vault
  const { data: ok } = await admin.rpc('sync_secret_ok', { p_secret: req.headers.get('x-sync-secret') ?? '' })
  if (ok !== true) return json({ error: 'FORBIDDEN' }, 403)

  const body = await req.json().catch(() => null)
  const connectionId = body?.connectionId
  if (typeof connectionId !== 'string') return json({ error: 'BAD_REQUEST' }, 400)

  const { data: conn } = await admin
    .from('exchange_connections')
    .select('id, user_id, exchange, label, api_key, cursor_at')
    .eq('id', connectionId)
    .maybeSingle()
  if (!conn) return json({ error: 'NOT_FOUND' }, 404)
  const userId = conn.user_id as string

  // 2. Только Pro Plus (dispatch_sync уже отбирает Pro Plus — проверяем ещё раз: тариф мог закончиться)
  const { data: plan } = await admin.rpc('effective_plan', { uid: userId })
  if (plan !== 'pro_plus') return json({ skipped: 'NOT_PRO_PLUS' })

  // 3. Bybit: подпись запросов ключом пользователя (только адреса для чтения)
  let secret: string | null = null
  if (conn.exchange === 'bybit') {
    const { data } = await admin.rpc('get_connection_secret', { p_id: conn.id })
    if (typeof data !== 'string') return json({ error: 'NO_SECRET' }, 500)
    secret = data
  }
  const bybitCall = async (path: string, params: Record<string, string | number>) => {
    if (!READ_PATHS.has(path) || !secret) throw new Error('NOT_ALLOWED')
    const query = buildQuery(params)
    const ts = Date.now().toString()
    const sign = await bybitSignature(secret, ts + conn.api_key + RECV_WINDOW + query)
    const res = await fetch(`${BYBIT}${path}${query ? `?${query}` : ''}`, {
      headers: { 'X-BAPI-API-KEY': conn.api_key as string, 'X-BAPI-TIMESTAMP': ts, 'X-BAPI-RECV-WINDOW': RECV_WINDOW, 'X-BAPI-SIGN': sign },
    })
    if (!res.ok) throw new Error(`EXCHANGE_HTTP_${res.status} network`)
    return await res.json()
  }

  const update = (patch: Row) => admin.from('exchange_connections').update(patch).eq('id', conn.id)

  try {
    const result = await runSync(
      { id: conn.id as string, exchange: conn.exchange as string, label: conn.label as string | null, api_key: conn.api_key as string, cursor_at: conn.cursor_at as string | null },
      {
        bybitCall,
        // какие сделки уже есть у пользователя на этой бирже
        existingIds: async (exchange, ids) => {
          const found = new Set<string>()
          for (const part of chunks([...new Set(ids)], ID_CHUNK)) {
            const { data, error } = await admin.from('trades').select('external_id').eq('user_id', userId).eq('exchange', exchange).in('external_id', part)
            if (error) throw error
            for (const r of data as { external_id: string }[]) found.add(r.external_id)
          }
          return found
        },
        remaining: async () => null, // Pro Plus — без лимита (лимит всё равно проверяет триггер в базе)
        insert: async ({ exchange, filename, trades }) => {
          const { data: rec, error: recErr } = await admin
            .from('imports')
            .insert({ user_id: userId, exchange, filename: filename.slice(0, 200), rows_total: trades.length })
            .select('id')
            .single()
          if (recErr) return { inserted: 0, error: recErr }
          const importId = (rec as { id: string }).id
          const toRow = (t: Row) => ({ ...t, id: crypto.randomUUID(), user_id: userId, source: 'api', import_id: importId })
          let inserted = 0
          let stop: unknown = null
          outer: for (const part of chunks(trades as unknown as Row[], CHUNK)) {
            const { error } = await admin.from('trades').insert(part.map(toRow))
            if (!error) {
              inserted += part.length
              continue
            }
            if (error.code !== '23505') {
              stop = error
              break
            }
            // дубль в пачке (параллельная синхронизация из браузера) — по одной
            for (const t of part) {
              const { error: one } = await admin.from('trades').insert(toRow(t))
              if (!one) inserted++
              else if (one.code !== '23505') {
                stop = one
                break outer
              }
            }
          }
          await admin.from('imports').update({ rows_imported: inserted, rows_skipped: trades.length - inserted }).eq('id', importId)
          return { inserted, error: stop }
        },
        touch: async (cursor, error) => {
          await update({ last_sync_at: new Date().toISOString(), ...(cursor ? { cursor_at: cursor } : {}), last_error: error })
        },
        setKeyExpiry: async (iso) => {
          await update({ key_expires_at: iso })
        },
      },
    )
    return json(result)
  } catch (e) {
    // ошибка уже записана в подключение (last_error) — сайт её покажет
    return json({ error: (e as { code?: string }).code ?? 'UNKNOWN' })
  }
})
