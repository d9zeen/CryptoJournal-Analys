import { Link } from 'react-router'
import { useT } from '@/i18n'

export function NotFoundPage() {
  const t = useT()
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <div className="text-5xl font-semibold text-muted">404</div>
      <p>{t.common.notFound}</p>
      <Link to="/" className="text-primary hover:underline">
        {t.common.toHome}
      </Link>
    </div>
  )
}
