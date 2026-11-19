/**
 * /demo — «Открыть демо» без регистрации: вход гостем + демо-счёт, затем дашборд.
 * Уже вошёл по-настоящему — сразу в дашборд (своё демо не нужно). Гость вернулся — его демо-счёт на месте.
 * Не вышло (анонимный вход выключен в Supabase, нет сети) — объяснение и «Начать бесплатно».
 */
import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { useT } from '@/i18n'
import { Logo } from '@/components/Logo'
import { Shimmer } from '@/components/fx/Shimmer'
import { useAuth } from '@/features/auth/AuthProvider'
import { startDemo } from './api'

export function DemoPage() {
  const t = useT()
  const d = t.demo
  const { user, isGuest, loading } = useAuth()
  const navigate = useNavigate()
  const [failed, setFailed] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    if (loading || (user && !isGuest) || started.current) return
    started.current = true
    startDemo()
      .then(() => navigate('/dashboard', { replace: true }))
      .catch(() => setFailed(true))
  }, [loading, user, isGuest, navigate])

  if (!loading && user && !isGuest) return <Navigate to="/dashboard" replace />

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <Logo />
      {failed ? (
        <div data-demo-failed className="flex max-w-sm flex-col items-center gap-4">
          <p className="text-sm text-muted">{d.failed}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/register" className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary hover:bg-primary-hover">
              {t.landing.start}
            </Link>
            <Link to="/welcome" className="rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-sm font-semibold hover:border-muted/60">
              {d.home}
            </Link>
          </div>
        </div>
      ) : (
        <p data-demo-loading className="text-sm text-muted" role="status">
          <Shimmer>{d.preparing}</Shimmer>
        </p>
      )}
    </main>
  )
}
