import type { Dict } from '@/i18n/ru'

/** Ошибка запроса к базе → понятный текст. */
export function dbErrorMessage(error: unknown, t: Dict): string {
  const msg = error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : ''
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : ''
  if (msg.includes('FREE_LIMIT_REACHED')) return t.errors.freeLimit
  if (msg.includes('SCREENSHOT_LIMIT_REACHED')) return t.errors.screenshotLimit
  if (msg.includes('ROW_LIMIT_REACHED')) return t.errors.rowLimit
  if (msg.includes('MFA_REQUIRED')) return t.errors.mfaRequired
  if (msg.includes('PALETTE_NEEDS_PRO')) return t.errors.paletteNeedsPro
  if (code === '23505') return t.errors.duplicate
  if (code === '23514') return t.errors.invalidData
  if (msg.toLowerCase().includes('failed to fetch') || msg.toLowerCase().includes('network')) return t.errors.network
  return t.errors.generic
}
