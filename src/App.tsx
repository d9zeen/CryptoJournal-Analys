import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { GuestOnly, RequireAuth } from '@/features/auth/guards'
import { LoginPage } from '@/features/auth/LoginPage'
import { RegisterPage } from '@/features/auth/RegisterPage'
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage'
import { UpdatePasswordPage } from '@/features/auth/UpdatePasswordPage'
import { AppLayout } from '@/layout/AppLayout'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { TradesPage } from '@/features/trades/TradesPage'
import { TradeFormPage } from '@/features/trades/TradeFormPage'
import { ImportPage } from '@/features/import/ImportPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { NotFoundPage } from '@/components/NotFoundPage'
import { SetupNeeded } from '@/components/SetupNeeded'
import { isSupabaseConfigured } from '@/lib/supabase'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'

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
])

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
