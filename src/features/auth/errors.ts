import { isAuthRetryableFetchError, type AuthError } from '@supabase/supabase-js'
import type { Dict } from '@/i18n/ru'
import { fmt } from '@/i18n'

/** Сервер входа (Supabase) недоступен: нет интернета, блокировка провайдером, сбой сети. */
export function isAuthNetworkError(error: AuthError): boolean {
  return isAuthRetryableFetchError(error) || error.status === 0 || /failed to fetch|network|load failed/i.test(error.message)
}

/** Переводит ошибку Supabase Auth в понятный текст. */
export function authErrorMessage(error: AuthError, t: Dict): string {
  if (isAuthNetworkError(error)) return t.auth.errors.network
  switch (error.code) {
    case 'invalid_credentials':
      return t.auth.errors.invalidCredentials
    case 'email_not_confirmed':
      return t.auth.errors.emailNotConfirmed
    case 'user_already_exists':
    case 'email_exists':
      return t.auth.errors.userExists
    case 'weak_password':
      return t.auth.errors.passwordShort
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return t.auth.errors.rateLimit
    case 'signup_disabled':
    case 'email_provider_disabled':
      return t.auth.errors.signupDisabled
    default:
      // код ошибки помогает разобраться, что случилось (его можно прислать в поддержку)
      return fmt(t.auth.errors.genericWithCode, { code: error.code ?? error.status ?? error.name })
  }
}

export const MIN_PASSWORD_LENGTH = 10

/** Проблема с новым паролем: короткий / только буквы или только цифры / слишком простой; null — пароль подходит */
export function passwordProblem(password: string): 'short' | 'weak' | null {
  if (password.length < MIN_PASSWORD_LENGTH) return 'short'
  const hasLetter = /\p{L}/u.test(password)
  const hasDigit = /\d/.test(password)
  const distinct = new Set(password.toLowerCase()).size
  if (!hasLetter || !hasDigit || distinct < 5) return 'weak'
  return null
}
