/**
 * exchange-proxy — серверная функция Supabase (Deno): подписывает запросы к бирже ключом пользователя.
 *
 * Зачем сервер: секрет API нельзя держать в браузере. Здесь он берётся из Vault (service_role)
 * только на время одного запроса и наружу не отдаётся.
 *
 * Защита:
 *  - вызвать может только вошедший пользователь (JWT проверяет Supabase + getUser ниже);
 *  - подключение читается С ЕГО ПРАВАМИ (RLS + 2FA): чужое подключение просто не найдётся;
 *  - к бирже — только адреса для чтения (BYBIT_READ_PATHS) и только разрешённые параметры;
 *  - ключ с правом торговли отклоняет сайт при подключении (/v5/user/query-api → readOnly).
 *
 * Выкладка: Supabase → Edge Functions → exchange-proxy (или коннектор Supabase у Claude).
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { BYBIT_READ_PATHS, buildQuery, bybitSignature } from './sign.ts'

const ORIGINS = ['https://d9zeen.github.io', 'http://localhost:5173', 'http://127.0.0.1:4173']
const BYBIT = 'https://api.bybit.com'
const RECV_WINDOW = '10000'

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-region',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('Origin') ?? '')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  try {
    const auth = req.headers.get('Authorization') ?? ''
    if (!auth.startsWith('Bearer ')) return json({ error: 'NOT_AUTHENTICATED' }, 401)

    const url = Deno.env.get('SUPABASE_URL')!
    const publicKey = Deno.env.get('SUPABASE_ANON_KEY') ?? req.headers.get('apikey') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const asUser = createClient(url, publicKey, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } })

    const { data: who } = await asUser.auth.getUser()
    if (!who?.user) return json({ error: 'NOT_AUTHENTICATED' }, 401)

    const body = await req.json().catch(() => null)
    const connectionId = body?.connectionId
    const path = body?.path
    if (typeof connectionId !== 'string' || typeof path !== 'string') return json({ error: 'BAD_REQUEST' }, 400)

    // своё подключение — с правами пользователя (RLS + 2FA)
    const { data: conn } = await asUser.from('exchange_connections').select('id, exchange, api_key').eq('id', connectionId).maybeSingle()
    if (!conn) return json({ error: 'NOT_FOUND' }, 404)
    if (conn.exchange !== 'bybit' || !BYBIT_READ_PATHS.has(path)) return json({ error: 'NOT_ALLOWED' }, 403)

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
    const { data: secret, error: secretErr } = await admin.rpc('get_connection_secret', { p_id: conn.id })
    if (secretErr || typeof secret !== 'string') return json({ error: 'NO_SECRET' }, 500)

    const query = buildQuery(typeof body.params === 'object' && body.params ? body.params : {})
    const ts = Date.now().toString()
    const sign = await bybitSignature(secret, ts + conn.api_key + RECV_WINDOW + query)
    const res = await fetch(`${BYBIT}${path}${query ? `?${query}` : ''}`, {
      headers: { 'X-BAPI-API-KEY': conn.api_key, 'X-BAPI-TIMESTAMP': ts, 'X-BAPI-RECV-WINDOW': RECV_WINDOW, 'X-BAPI-SIGN': sign },
    })
    const text = await res.text()
    if (!res.ok) return json({ error: 'EXCHANGE_HTTP', status: res.status, body: text.slice(0, 300) }, 502)
    return new Response(text, { headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (e) {
    return json({ error: 'PROXY_ERROR', message: String(e).slice(0, 300) }, 500)
  }
})
