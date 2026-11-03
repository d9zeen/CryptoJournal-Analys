import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './AuthProvider'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { useT } from '@/i18n'

/** Пускает только залогиненных. Остальных отправляет на /login. */
export function RequireAuth() {
  const { user, loading } = useAuth()
  const location = useLocation()
  const t = useT()
  if (loading) return <FullPageSpinner label={t.common.loading} />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}

/** Страницы входа/регистрации: залогиненного сразу уводим в приложение. */
export function GuestOnly() {
  const { user, loading } = useAuth()
  const t = useT()
  if (loading) return <FullPageSpinner label={t.common.loading} />
  if (user) return <Navigate to="/dashboard" replace />
  return <Outlet />
}
