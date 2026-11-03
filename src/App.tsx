import { lazy, Suspense, type ComponentType } from 'react'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { GuestOnly, RequireAuth } from '@/features/auth/guards'
import { LoginPage } from '@/features/auth/LoginPage'
import { RegisterPage } from '@/features/auth/RegisterPage'
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage'
import { UpdatePasswordPage } from '@/features/auth/UpdatePasswordPage'
import { AppLayout } from '@/layout/AppLayout'
import { NotFoundPage } from '@/components/NotFoundPage'
import { SetupNeeded } from '@/components/SetupNeeded'
import { isSupabaseConfigured } from '@/lib/supabase'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'
import { BASENAME } from '@/lib/url'
import { PageSpinner } from '@/components/ui/Spinner'
import { useT } from '@/i18n'

/**
 * Страницы приложения грузятся отдельными файлами, когда на них заходят:
 * первый экран (вход) открывается быстрее, особенно на медленном интернете.
 */
function lazyPage<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  const Page = lazy<ComponentType>(() => load().then((m) => ({ default: m[name] })))
  return function LazyPage() {
    return (
      <Suspense fallback={<PageLoading />}>
        <Page />
      </Suspense>
    )
  }
}

function PageLoading() {
  const t = useT()
  return <PageSpinner label={t.common.loading} />
}

const DashboardPage = lazyPage(() => import('@/features/dashboard/DashboardPage'), 'DashboardPage')
const TradesPage = lazyPage(() => import('@/features/trades/TradesPage'), 'TradesPage')
const TradeFormPage = lazyPage(() => import('@/features/trades/TradeFormPage'), 'TradeFormPage')
const ImportPage = lazyPage(() => import('@/features/import/ImportPage'), 'ImportPage')
const SettingsPage = lazyPage(() => import('@/features/settings/SettingsPage'), 'SettingsPage')

const router = createBrowserRouter([
  // Только для незалогиненных
  {
    element: <GuestOnly />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
      { path: '/reset-password', element: <ResetPasswordPage /> },
    ],
  },
  // Ссылка из письма «сменить пароль» — доступна всегда
  { path: '/update-password', element: <UpdatePasswordPage /> },
  // Приложение — только для залогиненных
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <Navigate to="/dashboard" replace /> },
          { path: '/dashboard', element: <DashboardPage /> },
          { path: '/trades', element: <TradesPage /> },
          { path: '/trades/new', element: <TradeFormPage /> },
          { path: '/trades/:id', element: <TradeFormPage /> },
          { path: '/import', element: <ImportPage /> },
          { path: '/settings', element: <SettingsPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
], { basename: BASENAME })

export function App() {
  if (!isSupabaseConfigured) return <SetupNeeded />
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  )
}
