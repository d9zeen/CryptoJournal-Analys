import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { supabase } from '@/lib/supabase'
import { fmt, useT } from '@/i18n'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { FormError } from '@/components/FormError'
import { PasswordInput } from '@/components/PasswordInput'
import { pause, useShake } from '@/lib/motion'
import { AuthLayout } from './AuthLayout'
import { CheckEmail } from './CheckEmail'
import { authErrorMessage, passwordProblem } from './errors'
import { appUrl } from '@/lib/url'

/**
 * Регистрация: полоска надёжности пароля (только подсказка), ошибки — как во входе (№4).
 * Подтверждение почты включено → экран «Проверь почту» (№6); выключено (signUp сразу вернул сессию) → галочка и в дневник.
 */
export function RegisterPage() {
  const t = useT()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError] = useState<{ text: string; field: 'email' | 'password' | null } | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [cardRef, shake] = useShake<HTMLDivElement>()

  const fail = (text: string, field: 'email' | 'password' | null) => {
    setError({ text, field })
    shake()
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (passwordProblem(password)) return fail(t.auth.errors.passwordShort, 'password')
    if (password !== password2) return fail(t.auth.errors.passwordMismatch, 'password')

    setLoading(true)
    const cleanEmail = email.trim()
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        emailRedirectTo: appUrl('login'),
        // часовой пояс браузера → профиль (для статистики по часам)
        data: { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      },
    })
    setLoading(false)
    if (error) return fail(authErrorMessage(error, t), error.code === 'weak_password' ? 'password' : 'email')
    // Supabase не раскрывает, что email занят: возвращает пользователя без identities
    if (data.user && data.user.identities?.length === 0) return fail(t.auth.errors.userExists, 'email')
    // Подтверждение email выключено → сессия есть сразу: галочка и в дневник, без «Проверь почту»
    if (data.session) {
      setDone(true)
      await pause(400)
      return navigate('/dashboard', { replace: true })
    }
    setSentTo(cleanEmail)
  }

  async function resend(): Promise<string | null> {
    const { error } = await supabase.auth.resend({ type: 'signup', email: sentTo!, options: { emailRedirectTo: appUrl('login') } })
    return error ? authErrorMessage(error, t) : null
  }

  if (sentTo) {
    return (
      <AuthLayout title={t.auth.register.title}>
        <CheckEmail text={fmt(t.auth.checkEmail.signup, { email: sentTo })} onResend={resend} />
        <Link to="/login" className="mt-4 block text-center text-sm text-primary hover:underline">
          {t.auth.register.toLogin}
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title={t.auth.register.title} cardRef={cardRef}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormError message={error?.text ?? null} />
        <Input
          label={t.auth.email}
          type="email"
          autoComplete="email"
          required
          invalid={error?.field === 'email'}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <PasswordInput
          label={t.auth.password}
          autoComplete="new-password"
          required
          meter
          invalid={error?.field === 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <PasswordInput
          label={t.auth.passwordRepeat}
          autoComplete="new-password"
          required
          invalid={error?.field === 'password'}
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
        />
        <Button type="submit" loading={loading} done={done}>
          {t.auth.register.submit}
        </Button>
        <p className="text-center text-sm text-muted">
          {t.auth.register.hasAccount}{' '}
          <Link to="/login" className="text-primary hover:underline">
            {t.auth.register.toLogin}
          </Link>
        </p>
        <Link to="/privacy" className="text-center text-xs text-muted hover:text-text hover:underline">
          {t.privacy.link}
        </Link>
      </form>
    </AuthLayout>
  )
}
