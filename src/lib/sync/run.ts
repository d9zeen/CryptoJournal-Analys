/**
 * Синхронизация одного подключения — общий движок для браузера и сервера (sync-worker по расписанию).
 * Всё внешнее (запросы к бирже, база) передаётся снаружи в deps: в браузере — с правами пользователя,
 * на сервере — с правами service_role. Так логика одна и покрыта одними тестами.
 */
import { planImport } from '@/lib/import/plan'
import type { ImportedTrade, ParsedRow } from '@/lib/import/types'
import { BYBIT_HISTORY_DAYS, BybitError, DAY, checkBybitKey, fetchBybitTrades, type BybitCall } from './bybit'
import { fetchHlFills, hlFillsToTrades } from './hyperliquid'
import { fetchPmClosed, pmDirectGet, pmPositionToTrade, type PmGet } from './polymarket'

export type SyncConnection = {
  id: string
  exchange: string
  label: string | null
  api_key: string
  cursor_at: string | null
}

export type SyncResult = { found: number; inserted: number; overLimit: number }

export type SyncDeps = {
  /** запросы к Bybit, подписанные ключом подключения */
  bybitCall: BybitCall
  fetchFn?: typeof fetch
  /** запросы к Polymarket Data API (по умолчанию — напрямую; из браузера — через exchange-proxy) */
  polymarketGet?: PmGet
  /** external_id сделок этой биржи, которые уже есть у пользователя */
  existingIds: (exchange: string, ids: string[]) => Promise<Set<string>>
  /** сколько сделок ещё можно создать в этом месяце (null — без лимита) */
  remaining: () => Promise<number | null>
  /** записать сделки (одна запись в «Истории импортов») */
  insert: (args: { exchange: string; filename: string; trades: ImportedTrade[] }) => Promise<{ inserted: number; error: unknown | null }>
  /** после синхронизации: с какого места продолжать и ошибка (null — без ошибки) */
  touch: (cursorIso: string | null, error: string | null) => Promise<void>
  /** дата окончания ключа (Bybit отключает ключи без IP через 90 дней) */
  setKeyExpiry?: (iso: string | null) => Promise<void>
  now?: () => number
}

/** Ошибка подключения / синхронизации — код для текста в i18n (connections.errors) */
export class SyncError extends Error {
  constructor(
    public code: string,
    public detail = '',
  ) {
    super(code)
  }
}

/** Ошибки Bybit, понятные человеку */
function bybitErrorCode(e: BybitError): string {
  if ([10003, 10004, 33004].includes(e.code)) return 'KEY_INVALID'
  if (e.code === 10005) return 'KEY_NO_PERMISSION'
  if (e.code === 10010) return 'KEY_IP'
  if (e.code === 10006 || e.code === 10018) return 'RATE_LIMIT'
  return 'EXCHANGE'
}

export function toSyncError(e: unknown): SyncError {
  if (e instanceof SyncError) return e
  if (e instanceof BybitError) return new SyncError(bybitErrorCode(e), `${e.code}: ${e.message}`)
  const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e)
  if (msg.includes('FREE_LIMIT_REACHED')) return new SyncError('FREE_LIMIT')
  if (/HL_HTTP|PM_HTTP|fetch|network/i.test(msg)) return new SyncError('EXCHANGE_DOWN', msg)
  return new SyncError('UNKNOWN', msg)
}

/** Код ошибки из last_error («KEY_INVALID | 10003: …») */
export const errorCodeOf = (lastError: string | null) => (lastError ? lastError.split(' | ')[0] : null)

/** 0x1234…abcd / ключ: первые и последние символы */
export const shortKey = (key: string) => (key.length > 12 ? `${key.slice(0, 6)}…${key.slice(-4)}` : key)

/** Скачать новые сделки подключения и записать их (дубли и лимит — как при импорте файла) */
export async function runSync(conn: SyncConnection, deps: SyncDeps): Promise<SyncResult> {
  const now = (deps.now ?? Date.now)()
  try {
    let trades: ImportedTrade[]
    let nextCursor: number | null
    if (conn.exchange === 'bybit') {
      // ключ всё ещё «только чтение» и когда он истекает
      const info = await checkBybitKey(deps.bybitCall)
      if (!info.readOnly) throw new SyncError('KEY_NOT_READONLY')
      await deps.setKeyExpiry?.(info.expiresAt)
      // с запасом в 2 дня: Bybit может отдать закрытие чуть позже, дубли всё равно отсеются
      const from = conn.cursor_at ? Date.parse(conn.cursor_at) - 2 * DAY : now - BYBIT_HISTORY_DAYS * DAY
      trades = await fetchBybitTrades(deps.bybitCall, from, now)
      nextCursor = now
    } else if (conn.exchange === 'hyperliquid') {
      const from = conn.cursor_at ? Date.parse(conn.cursor_at) : 0
      const res = hlFillsToTrades(await fetchHlFills(conn.api_key, from, deps.fetchFn))
      trades = res.trades
      nextCursor = res.cursor
    } else if (conn.exchange === 'polymarket') {
      // закрытые позиции целиком (их немного); повторы отсекаются по id
      const positions = await fetchPmClosed(deps.polymarketGet ?? pmDirectGet(deps.fetchFn), conn.api_key)
      trades = positions.flatMap((p) => {
        const t = pmPositionToTrade(p)
        return t ? [t] : []
      })
      nextCursor = now
    } else {
      throw new SyncError('UNSUPPORTED')
    }

    // одна и та же сделка могла прийти дважды (окна, страницы) — оставляем одну
    trades = [...new Map(trades.map((t) => [t.external_id, t])).values()]
    const existing = await deps.existingIds(conn.exchange, trades.map((t) => t.external_id))
    const rows: ParsedRow[] = trades.map((trade, i) => ({ line: i + 2, trade, error: null, warnings: [] }))
    const plan = planImport(rows, existing, await deps.remaining())
    let inserted = 0
    if (plan.toInsert.length) {
      const res = await deps.insert({ exchange: conn.exchange, filename: `API · ${conn.label ?? shortKey(conn.api_key)}`, trades: plan.toInsert })
      inserted = res.inserted
      if (res.error) throw res.error
    }
    // не всё влезло в лимит Free — курсор не двигаем: остальное подтянется в следующем месяце
    const cursor = plan.counts.overLimit > 0 || nextCursor === null ? null : new Date(nextCursor).toISOString()
    await deps.touch(cursor, null)
    return { found: trades.length, inserted, overLimit: plan.counts.overLimit }
  } catch (e) {
    const err = toSyncError(e)
    await deps.touch(null, `${err.code}${err.detail ? ` | ${err.detail}` : ''}`.slice(0, 500))
    throw err
  }
}
