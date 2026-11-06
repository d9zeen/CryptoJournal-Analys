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
      // сервер (настройки Supabase) строже сайта — объясняем, а не пишем «короткий»
      return t.auth.errors.passwordWeak
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

/** Минимум 6 символов — как минимум у Supabase; других требований нет (решение владельца 06.11.2026: простые пароли разрешены) */
export const MIN_PASSWORD_LENGTH = 6

/** Проблема с новым паролем: только длина; null — пароль подходит */
export function passwordProblem(password: string): 'short' | null {
  return password.length < MIN_PASSWORD_LENGTH ? 'short' : null
}
