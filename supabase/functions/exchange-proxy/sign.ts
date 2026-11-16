/**
 * Подпись запросов к биржам (Bybit, BingX, OKX, Bitget, Binance) — только чтение.
 * Чистые функции на WebCrypto, без Deno: их используют серверные функции exchange-proxy и sync-worker
 * (через engine.js) и проверяют тесты Vitest (sign.test.ts).
 *
 * Защита: к бирже уходят только адреса из READ_PATHS и только параметры из PARAMS.
 * Метод — GET (у всех пяти бирж история, права ключа и балансы — GET), тела запроса нет; единственное исключение — POST_PATHS.
 */

export type CexId = 'bybit' | 'bingx' | 'okx' | 'bitget' | 'binance'
export const CEX_IDS: readonly CexId[] = ['bybit', 'bingx', 'okx', 'bitget', 'binance']
export const isCex = (exchange: string): exchange is CexId => (CEX_IDS as readonly string[]).includes(exchange)

/** Ключ подключения: публичная часть + секрет и (OKX, Bitget) кодовая фраза */
export type Cred = { apiKey: string; secret: string; passphrase: string | null }

/** Адреса, к которым пускаем: история сделок и права ключа. Ни торговли, ни вывода, ни переводов */
export const READ_PATHS: Record<CexId, ReadonlySet<string>> = {
  bybit: new Set([
    '/v5/position/closed-pnl', '/v5/user/query-api', '/v5/execution/list',
    // портфель (0019): балансы единого счёта, фандинга (это запрос, не перевод) и Earn
    '/v5/account/wallet-balance', '/v5/asset/transfer/query-account-coins-balance', '/v5/earn/position',
  ]),
  bingx: new Set([
    '/openApi/swap/v2/trade/positionHistory', '/openApi/swap/v2/user/income', '/openApi/v1/account/apiPermissions',
    '/openApi/spot/v1/account/balance', '/openApi/swap/v2/user/balance',
    // портфель, этап 2: история спотовых исполнений — средняя цена входа
    '/openApi/spot/v1/trade/myTrades',
  ]),
  okx: new Set([
    '/api/v5/account/positions-history', '/api/v5/account/config', '/api/v5/public/instruments',
    '/api/v5/account/balance', '/api/v5/asset/balances', '/api/v5/finance/savings/balance',
    // портфель, этап 2 (0020): история спотовых исполнений — средняя цена входа
    '/api/v5/trade/fills-history',
  ]),
  bitget: new Set([
    '/api/v2/mix/position/history-position', '/api/v3/position/history-position', '/api/v3/account/settings', '/api/v3/account/info', '/api/v2/spot/account/info',
    '/api/v3/account/assets', '/api/v2/spot/account/assets', '/api/v2/mix/account/accounts',
    // портфель, этап 2: история спотовых исполнений (единый аккаунт / классический)
    '/api/v3/trade/fills', '/api/v2/spot/trade/fills',
  ]),
  binance: new Set([
    '/fapi/v1/income', '/fapi/v1/userTrades', '/sapi/v1/account/apiRestrictions',
    '/api/v3/account', '/sapi/v1/asset/get-funding-asset', '/fapi/v2/balance', '/sapi/v1/simple-earn/flexible/position', '/sapi/v1/simple-earn/locked/position',
    '/api/v3/myTrades',
  ]),
}

/**
 * Единственное исключение из «только GET»: баланс фандинга Binance отдаётся только на POST (это чтение, USER_DATA).
 * Подпись и параметры — в адресе, тело пустое, как у GET.
 */
export const POST_PATHS: ReadonlySet<string> = new Set(['/sapi/v1/asset/get-funding-asset'])

/** Какие параметры можно передать бирже (всё остальное отбрасываем) */
const PARAMS: Record<CexId, ReadonlySet<string>> = {
  bybit: new Set(['category', 'symbol', 'startTime', 'endTime', 'limit', 'cursor', 'accountType', 'coin']),
  bingx: new Set(['symbol', 'currency', 'incomeType', 'startTime', 'endTime', 'limit', 'pageIndex', 'pageSize']),
  okx: new Set(['instType', 'instId', 'after', 'before', 'limit']),
  bitget: new Set(['productType', 'category', 'symbol', 'startTime', 'endTime', 'limit', 'idLessThan', 'cursor']),
  binance: new Set(['symbol', 'incomeType', 'startTime', 'endTime', 'limit', 'fromId', 'omitZeroBalances', 'size', 'current']),
}

/** Значения параметров (кроме курсора Bybit) — только безопасные символы: подпись совпадает с адресом без кодирования */
const SAFE_VALUE = /^[A-Za-z0-9_.-]{1,64}$/

/** Где биржа: у Binance фьючерсы и права ключа — на разных адресах; OKX — три региона (общий, Европа, США) */
export function hostsFor(exchange: CexId, path: string): string[] {
  switch (exchange) {
    case 'bybit':
      return ['https://api.bybit.com']
    case 'bingx':
      return ['https://open-api.bingx.com']
    case 'okx':
      return ['https://www.okx.com', 'https://eea.okx.com', 'https://us.okx.com']
    case 'bitget':
      return ['https://api.bitget.com']
    case 'binance':
      return [path.startsWith('/sapi/') || path.startsWith('/api/') ? 'https://api.binance.com' : 'https://fapi.binance.com']
  }
}

/** Параметры → строка запроса Bybit (в том же порядке, в котором её подписываем) */
export function buildQuery(params: Record<string, unknown>): string {
  return Object.entries(params)
    .filter(([k, v]) => PARAMS.bybit.has(k) && (typeof v === 'string' || typeof v === 'number') && String(v) !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&')
}

/** Разрешённые параметры биржи → пары [ключ, значение] (по алфавиту, если бирже нужен порядок) */
export function pickParams(exchange: CexId, params: Record<string, unknown>, sorted = false): [string, string][] {
  const out = Object.entries(params ?? {})
    .filter(([k, v]) => PARAMS[exchange].has(k) && (typeof v === 'string' || typeof v === 'number') && SAFE_VALUE.test(String(v)))
    .map(([k, v]) => [k, String(v)] as [string, string])
  return sorted ? out.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)) : out
}

const joinParams = (pairs: [string, string][]) => pairs.map(([k, v]) => `${k}=${v}`).join('&')

async function hmac(secret: string, payload: string): Promise<Uint8Array> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(payload)))
}
export const hmacHex = async (secret: string, payload: string) => Array.from(await hmac(secret, payload), (b) => b.toString(16).padStart(2, '0')).join('')
export const hmacBase64 = async (secret: string, payload: string) => btoa(String.fromCharCode(...(await hmac(secret, payload))))

/** Подпись Bybit: HMAC-SHA256(секрет, timestamp + apiKey + recvWindow + queryString) в hex */
export const bybitSignature = hmacHex

/** Адреса Bybit, к которым функция пускает (оставлено для совместимости) */
export const BYBIT_READ_PATHS = READ_PATHS.bybit

/**
 * Секрет из Vault → секрет и кодовая фраза.
 * Ключи с кодовой фразой (OKX, Bitget) хранятся одной строкой JSON {"s": секрет, "p": фраза} (0018), остальные — как есть.
 */
export function parseSecret(stored: string): { secret: string; passphrase: string | null } {
  if (stored.startsWith('{')) {
    try {
      const o = JSON.parse(stored) as { s?: unknown; p?: unknown }
      if (typeof o.s === 'string') return { secret: o.s, passphrase: typeof o.p === 'string' ? o.p : null }
    } catch {
      /* не JSON — обычный секрет */
    }
  }
  return { secret: stored, passphrase: null }
}

const RECV_WINDOW = '10000'

/** Подписанный GET-запрос к бирже: адрес и заголовки. host — один из hostsFor() */
export async function signRequest(
  exchange: CexId,
  cred: Cred,
  path: string,
  params: Record<string, unknown>,
  host: string = hostsFor(exchange, path)[0],
  now: number = Date.now(),
): Promise<{ url: string; headers: Record<string, string> }> {
  if (!READ_PATHS[exchange].has(path)) throw new Error('NOT_ALLOWED')
  const ts = String(now)
  switch (exchange) {
    case 'bybit': {
      const query = buildQuery(params)
      const sign = await hmacHex(cred.secret, ts + cred.apiKey + RECV_WINDOW + query)
      return {
        url: `${host}${path}${query ? `?${query}` : ''}`,
        headers: { 'X-BAPI-API-KEY': cred.apiKey, 'X-BAPI-TIMESTAMP': ts, 'X-BAPI-RECV-WINDOW': RECV_WINDOW, 'X-BAPI-SIGN': sign },
      }
    }
    case 'bingx': {
      // параметры по алфавиту + timestamp; подпись hex от той же строки, что в адресе
      const query = joinParams([...pickParams('bingx', params, true), ['timestamp', ts]])
      const sign = await hmacHex(cred.secret, query)
      return { url: `${host}${path}?${query}&signature=${sign}`, headers: { 'X-BX-APIKEY': cred.apiKey } }
    }
    case 'binance': {
      const query = joinParams([...pickParams('binance', params), ['recvWindow', RECV_WINDOW], ['timestamp', ts]])
      const sign = await hmacHex(cred.secret, query)
      return { url: `${host}${path}?${query}&signature=${sign}`, headers: { 'X-MBX-APIKEY': cred.apiKey } }
    }
    case 'okx': {
      // OK-ACCESS-SIGN = base64(HMAC(время ISO + GET + путь с параметрами))
      const query = joinParams(pickParams('okx', params))
      const requestPath = `${path}${query ? `?${query}` : ''}`
      const iso = new Date(now).toISOString()
      const sign = await hmacBase64(cred.secret, iso + 'GET' + requestPath)
      return {
        url: `${host}${requestPath}`,
        headers: { 'OK-ACCESS-KEY': cred.apiKey, 'OK-ACCESS-SIGN': sign, 'OK-ACCESS-TIMESTAMP': iso, 'OK-ACCESS-PASSPHRASE': cred.passphrase ?? '' },
      }
    }
    case 'bitget': {
      // ACCESS-SIGN = base64(HMAC(время мс + GET + путь + ?параметры))
      const query = joinParams(pickParams('bitget', params, true))
      const requestPath = `${path}${query ? `?${query}` : ''}`
      const sign = await hmacBase64(cred.secret, ts + 'GET' + requestPath)
      return {
        url: `${host}${requestPath}`,
        headers: {
          'ACCESS-KEY': cred.apiKey,
          'ACCESS-SIGN': sign,
          'ACCESS-TIMESTAMP': ts,
          'ACCESS-PASSPHRASE': cred.passphrase ?? '',
          locale: 'en-US',
          'Content-Type': 'application/json',
        },
      }
    }
  }
}

/** Ответ биржи: статус HTTP и тело (JSON — разобранный, иначе null) */
export type ExchangeReply = { status: number; json: unknown; text: string }

/** OKX: «такого ключа нет» — ключ создан в другом регионе (my.okx.com → eea.okx.com, app.okx.com → us.okx.com) */
const okxWrongRegion = (r: ExchangeReply) => (r.json as { code?: unknown } | null)?.code === '50119'

/** На каком адресе OKX нашёлся ключ (на время жизни функции — чтобы не перебирать регионы на каждой странице) */
const okxHost = new Map<string, string>()

/**
 * Запрос к бирже с подписью. Для OKX — сам находит регион ключа.
 * Ошибки сети пробрасываются; ответ с ошибкой биржи (4xx с JSON) возвращается как есть — его разбирает модуль биржи.
 */
export async function callExchange(
  exchange: CexId,
  cred: Cred,
  path: string,
  params: Record<string, unknown>,
  fetchFn: typeof fetch = fetch,
): Promise<ExchangeReply> {
  const all = hostsFor(exchange, path)
  const known = exchange === 'okx' ? okxHost.get(cred.apiKey) : undefined
  const hosts = known ? [known, ...all.filter((h) => h !== known)] : all
  let reply: ExchangeReply | null = null
  for (const host of hosts) {
    const { url, headers } = await signRequest(exchange, cred, path, params, host)
    const res = await fetchFn(url, { method: POST_PATHS.has(path) ? 'POST' : 'GET', headers })
    const text = await res.text()
    let json: unknown = null
    try {
      json = JSON.parse(text)
    } catch {
      /* не JSON (страница ошибки) */
    }
    reply = { status: res.status, json, text }
    if (exchange !== 'okx' || !okxWrongRegion(reply)) {
      if (exchange === 'okx') okxHost.set(cred.apiKey, host)
      return reply
    }
  }
  return reply as ExchangeReply
}
