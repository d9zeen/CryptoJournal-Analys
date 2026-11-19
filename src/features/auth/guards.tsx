import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './AuthProvider'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { useT } from '@/i18n'
import { useAal } from './mfa'
import { MfaChallengePage } from './MfaChallengePage'

/**
 * Пускает только залогиненных. Остальных отправляет на /login.
 * Если включена 2FA и код ещё не введён — показывает экран ввода кода.
 */
export function RequireAuth() {
  const { user, loading } = useAuth()
  const location = useLocation()
  const t = useT()
  const aal = useAal()
  if (loading || (user && aal.isLoading)) return <FullPageSpinner label={t.common.loading} />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (aal.data?.needsCode) return <MfaChallengePage />
  return <Outlet />
}

/** Страницы входа/регистрации: залогиненного сразу уводим в приложение (гость демо — может войти или зарегистрироваться). */
export function GuestOnly() {
  const { user, isGuest, loading } = useAuth()
  const t = useT()
  if (loading) return <FullPageSpinner label={t.common.loading} />
  if (user && !isGuest) return <Navigate to="/dashboard" replace />
  return <Outlet />
}
