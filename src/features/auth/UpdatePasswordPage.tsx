import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { supabase } from '@/lib/supabase'
import { useT } from '@/i18n'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { AuthLayout } from './AuthLayout'
import { useAuth } from './AuthProvider'
import { MIN_PASSWORD_LENGTH, authErrorMessage } from './errors'

/** Шаг 2: сюда ведёт ссылка из письма. Supabase сам создаёт сессию из ссылки. */
export function UpdatePasswordPage() {
  const t = useT()
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (authLoading) return <FullPageSpinner label={t.common.loading} />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < MIN_PASSWORD_LENGTH) return setError(t.auth.errors.passwordShort)
    if (password !== password2) return setError(t.auth.errors.passwordMismatch)
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) return setError(authErrorMessage(error, t))
    navigate('/dashboard', { replace: true })
  }

  return (
    <AuthLayout title={t.auth.update.title}>
      {!user ? (
        <>
          <Alert tone="error">{t.auth.update.noSession}</Alert>
          <Link to="/reset-password" className="mt-4 block text-center text-sm text-primary hover:underline">
            {t.auth.reset.title}
          </Link>
        </>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Input label={t.auth.newPassword} type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <Input label={t.auth.passwordRepeat} type="password" autoComplete="new-password" required value={password2} onChange={(e) => setPassword2(e.target.value)} />
          <Button type="submit" loading={loading}>
            {t.auth.update.submit}
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
