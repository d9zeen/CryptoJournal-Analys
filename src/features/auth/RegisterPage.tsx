import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { supabase } from '@/lib/supabase'
import { fmt, useT } from '@/i18n'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { AuthLayout } from './AuthLayout'
import { MIN_PASSWORD_LENGTH, authErrorMessage } from './errors'

export function RegisterPage() {
  const t = useT()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < MIN_PASSWORD_LENGTH) return setError(t.auth.errors.passwordShort)
    if (password !== password2) return setError(t.auth.errors.passwordMismatch)

    setLoading(true)
    const cleanEmail = email.trim()
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
        // часовой пояс браузера → профиль (для статистики по часам)
        data: { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      },
    })
    setLoading(false)
    if (error) return setError(authErrorMessage(error, t))
    // Supabase не раскрывает, что email занят: возвращает пользователя без identities
    if (data.user && data.user.identities?.length === 0) return setError(t.auth.errors.userExists)
    // Подтверждение email выключено → сессия есть сразу
    if (data.session) return navigate('/dashboard', { replace: true })
    setSentTo(cleanEmail)
  }

  if (sentTo) {
    return (
      <AuthLayout title={t.auth.register.title}>
        <Alert tone="success">{fmt(t.auth.register.checkEmail, { email: sentTo })}</Alert>
        <Link to="/login" className="mt-4 block text-center text-sm text-primary hover:underline">
          {t.auth.register.toLogin}
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title={t.auth.register.title}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Input label={t.auth.email} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label={t.auth.password} type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <Input label={t.auth.passwordRepeat} type="password" autoComplete="new-password" required value={password2} onChange={(e) => setPassword2(e.target.value)} />
        <Button type="submit" loading={loading}>
          {t.auth.register.submit}
        </Button>
        <p className="text-center text-sm text-muted">
          {t.auth.register.hasAccount}{' '}
          <Link to="/login" className="text-primary hover:underline">
            {t.auth.register.toLogin}
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
