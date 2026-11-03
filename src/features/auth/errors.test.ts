import { describe, expect, it } from 'vitest'
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js'
import { ru } from '@/i18n/ru'
import { authErrorMessage } from './errors'

describe('authErrorMessage', () => {
  it('нет связи с Supabase → понятный текст про сеть', () => {
    expect(authErrorMessage(new AuthRetryableFetchError('Failed to fetch', 0), ru)).toBe(ru.auth.errors.network)
  })
  it('известный код → свой текст', () => {
    expect(authErrorMessage(new AuthApiError('x', 400, 'invalid_credentials'), ru)).toBe(ru.auth.errors.invalidCredentials)
    expect(authErrorMessage(new AuthApiError('x', 422, 'user_already_exists'), ru)).toBe(ru.auth.errors.userExists)
  })
  it('неизвестная ошибка → общий текст с кодом', () => {
    expect(authErrorMessage(new AuthApiError('x', 500, 'unexpected_failure'), ru)).toContain('unexpected_failure')
  })
})
