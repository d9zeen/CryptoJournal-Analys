import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { supabase } from '@/lib/supabase'
import { useT } from '@/i18n'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { AuthLayout } from './AuthLayout'
import { authErrorMessage } from './errors'

export function LoginPage() {
  const t = useT()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setLoading(false)
    if (error) return setError(authErrorMessage(error, t))
    const from = (location.state as { from?: string } | null)?.from
    navigate(from ?? '/dashboard', { replace: true })
  }

  return (
    <AuthLayout title={t.auth.login.title}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Input label={t.auth.email} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label={t.auth.password} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className="-mt-1 text-right">
          <Link to="/reset-password" className="text-sm text-muted hover:text-text">
            {t.auth.login.forgot}
          </Link>
        </div>
        <Button type="submit" loading={loading}>
          {t.auth.login.submit}
        </Button>
        <p className="text-center text-sm text-muted">
          {t.auth.login.noAccount}{' '}
          <Link to="/register" className="text-primary hover:underline">
            {t.auth.login.toRegister}
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
