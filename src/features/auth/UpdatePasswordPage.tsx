import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { supabase } from '@/lib/supabase'
import { useT } from '@/i18n'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { FormError } from '@/components/FormError'
import { PasswordInput } from '@/components/PasswordInput'
import { pause, useShake } from '@/lib/motion'
import { AuthLayout } from './AuthLayout'
import { useAuth } from './AuthProvider'
import { authErrorMessage, passwordProblem } from './errors'

/** Шаг 2: сюда ведёт ссылка из письма. Supabase сам создаёт сессию из ссылки. */
export function UpdatePasswordPage() {
  const t = useT()
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [cardRef, shake] = useShake<HTMLDivElement>()

  if (authLoading) return <FullPageSpinner label={t.common.loading} />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const fail = (text: string) => {
      setError(text)
      shake()
    }
    if (passwordProblem(password)) return fail(t.auth.errors.passwordShort)
    if (password !== password2) return fail(t.auth.errors.passwordMismatch)
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) return fail(authErrorMessage(error, t))
    setDone(true)
    await pause(400)
    navigate('/dashboard', { replace: true })
  }

  return (
    <AuthLayout title={t.auth.update.title} cardRef={cardRef}>
      {!user ? (
        <>
          <Alert tone="error">{t.auth.update.noSession}</Alert>
          <Link to="/reset-password" className="mt-4 block text-center text-sm text-primary hover:underline">
            {t.auth.reset.title}
          </Link>
        </>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <FormError message={error} />
          <PasswordInput
            label={t.auth.newPassword}
            autoComplete="new-password"
            required
            meter
            invalid={Boolean(error)}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <PasswordInput
            label={t.auth.passwordRepeat}
            autoComplete="new-password"
            required
            invalid={Boolean(error)}
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
          />
          <Button type="submit" loading={loading} done={done}>
            {t.auth.update.submit}
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
