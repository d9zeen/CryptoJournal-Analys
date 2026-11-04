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

import { passwordProblem } from './errors'
describe('passwordProblem', () => {
  it('короткий', () => expect(passwordProblem('abc123')).toBe('short'))
  it('только буквы / только цифры / однообразный', () => {
    expect(passwordProblem('abcdefghijk')).toBe('weak')
    expect(passwordProblem('12345678901')).toBe('weak')
    expect(passwordProblem('aaaa1111aaaa')).toBe('weak')
  })
  it('нормальный', () => {
    expect(passwordProblem('Trade2026journal')).toBeNull()
    expect(passwordProblem('дневник2026сделок')).toBeNull()
  })
})

import { normalizeSvgDataUrl } from './mfa'
describe('normalizeSvgDataUrl', () => {
  it('кодирует сырой SVG', () => {
    expect(normalizeSvgDataUrl('data:image/svg+xml;utf-8,<svg a="1"/>')).toBe('data:image/svg+xml;charset=utf-8,%3Csvg%20a%3D%221%22%2F%3E')
  })
  it('уже закодированный и другие форматы не трогает', () => {
    expect(normalizeSvgDataUrl('data:image/svg+xml;utf-8,%3Csvg%2F%3E')).toBe('data:image/svg+xml;utf-8,%3Csvg%2F%3E')
    expect(normalizeSvgDataUrl('data:image/png;base64,AAA')).toBe('data:image/png;base64,AAA')
  })
})
