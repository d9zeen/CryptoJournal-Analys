/**
 * Двухфакторная защита (2FA) по коду из приложения-аутентификатора (TOTP):
 * Google Authenticator, Яндекс Ключ, 1Password, Authy и т.п.
 * Если 2FA включена, база отдаёт данные только сессии, подтверждённой кодом (уровень aal2) —
 * это проверяется правилами доступа в самой базе (миграция 0004), а не только здесь.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Factor } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuth } from './AuthProvider'

/** Уровень подтверждения текущей сессии: нужен ли ещё код */
export function useAal() {
  const { session } = useAuth()
  return useQuery({
    // токен меняется после ввода кода — тогда и перепроверяем
    queryKey: ['aal', session?.access_token],
    enabled: Boolean(session),
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (error) throw error
      return { needsCode: data.nextLevel === 'aal2' && data.currentLevel !== 'aal2', current: data.currentLevel }
    },
  })
}

/** Подтверждённые факторы (приложения-аутентификаторы) пользователя */
export function useFactors() {
  const { user, session } = useAuth()
  return useQuery({
    queryKey: ['mfaFactors', user?.id, session?.access_token],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase.auth.mfa.listFactors()
      if (error) throw error
      return { verified: data.totp, all: data.all }
    },
  })
}

/** Проверить 6-значный код для фактора. После успеха Supabase выдаёт сессию уровня aal2. */
export async function verifyCode(factorId: string, code: string): Promise<void> {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s/g, '') })
  if (error) throw error
}

export type Enrollment = { factorId: string; qr: string; secret: string }

/** Начать подключение: удаляем брошенные неподтверждённые попытки и создаём новую */
export async function startEnroll(): Promise<Enrollment> {
  const { data: list } = await supabase.auth.mfa.listFactors()
  for (const f of (list?.all ?? []) as Factor[]) {
    if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id })
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `CryptoJournal ${new Date().toISOString().slice(0, 10)}` })
  if (error) throw error
  return { factorId: data.id, qr: normalizeSvgDataUrl(data.totp.qr_code), secret: data.totp.secret }
}

/** Supabase отдаёт QR как «data:image/svg+xml;utf-8,<svg…>» без кодирования — приводим к стандартному виду */
export function normalizeSvgDataUrl(src: string): string {
  const m = /^data:image\/svg\+xml;(?:charset=)?utf-8,(.*)$/s.exec(src)
  if (!m || m[1].startsWith('%3C')) return src
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(m[1])}`
}

export async function cancelEnroll(factorId: string): Promise<void> {
  await supabase.auth.mfa.unenroll({ factorId })
}

/** Отключить 2FA (Supabase требует, чтобы сессия была подтверждена кодом) */
export async function disableFactor(factorId: string): Promise<void> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId })
  if (error) throw error
  await supabase.auth.refreshSession() // уровень сессии пересчитается
}

/** После изменений 2FA — перечитать всё, что зависит от уровня сессии */
export function useRefreshSecurity() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['aal'] })
    qc.invalidateQueries({ queryKey: ['mfaFactors'] })
  }
}
