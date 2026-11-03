import type { AuthError } from '@supabase/supabase-js'
import type { Dict } from '@/i18n/ru'

/** Переводит ошибку Supabase Auth в понятный текст. */
export function authErrorMessage(error: AuthError, t: Dict): string {
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
    default:
      return t.auth.errors.generic
  }
}

export const MIN_PASSWORD_LENGTH = 8
