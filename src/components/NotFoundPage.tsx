import { Link } from 'react-router'
import { useT } from '@/i18n'
import { Logo } from '@/components/Logo'
import { useAuth } from '@/features/auth/AuthProvider'

const btn = 'inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors'

/** 404: логотип, короткий текст и две кнопки — «Статистика» (если вошёл) и «На главную» */
export function NotFoundPage() {
  const t = useT()
  const { user } = useAuth()
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <Link to="/" aria-label={t.app.name}>
        <Logo size="lg" />
      </Link>
      <div>
        <div className="num text-6xl font-semibold text-muted">404</div>
        <h1 className="mt-2 text-xl font-semibold">{t.common.notFound}</h1>
        <p className="mt-2 max-w-sm text-sm text-muted">{t.common.notFoundText}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {user && (
          <Link to="/dashboard" className={`${btn} bg-primary text-on-primary hover:bg-primary-hover`}>
            {t.nav.dashboard}
          </Link>
        )}
        <Link to={user ? '/welcome' : '/'} className={`${btn} ${user ? 'border border-border bg-surface-2 text-text hover:border-muted/60' : 'bg-primary text-on-primary hover:bg-primary-hover'}`}>
          {t.common.toHome}
        </Link>
      </div>
    </div>
  )
}
