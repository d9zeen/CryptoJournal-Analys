/**
 * Точка входа для серверной синхронизации по расписанию (supabase/functions/sync-worker).
 * Собирается в один файл командой `npm run build:functions` — тот же код, что в браузере, и те же тесты.
 */
export { runSync, SyncError, toSyncError, type SyncConnection, type SyncDeps, type SyncResult } from './run'
export { buildQuery, bybitSignature } from '../../../supabase/functions/exchange-proxy/sign'
