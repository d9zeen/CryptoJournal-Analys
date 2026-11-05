/**
 * Подпись запросов Bybit v5 (HMAC-SHA256) и строка параметров.
 * Чистые функции без Deno — их проверяют тесты Vitest (sign.test.ts).
 */

/** Какие параметры можно передать бирже (всё остальное отбрасываем) */
const ALLOWED_PARAMS = new Set(['category', 'symbol', 'startTime', 'endTime', 'limit', 'cursor'])

/** Параметры → строка запроса в том же порядке, в котором её подписываем */
export function buildQuery(params: Record<string, unknown>): string {
  return Object.entries(params)
    .filter(([k, v]) => ALLOWED_PARAMS.has(k) && (typeof v === 'string' || typeof v === 'number') && String(v) !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&')
}

/** Подпись Bybit: HMAC-SHA256(секрет, timestamp + apiKey + recvWindow + queryString) в hex */
export async function bybitSignature(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(payload)))
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Адреса Bybit, к которым функция пускает: только чтение */
export const BYBIT_READ_PATHS = new Set(['/v5/position/closed-pnl', '/v5/user/query-api', '/v5/execution/list'])
