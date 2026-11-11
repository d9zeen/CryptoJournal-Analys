import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { supabase } from '@/lib/supabase'
import { useT } from '@/i18n'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { FormError } from '@/components/FormError'
import { PasswordInput } from '@/components/PasswordInput'
import { pause, useShake } from '@/lib/motion'
import { AuthLayout } from './AuthLayout'
import { authErrorMessage } from './errors'

/** Вход (№4): крутилка в кнопке, при ошибке форма «мотает головой» и сообщение выезжает, при успехе — галочка ~400 мс */
export function LoginPage() {
  const t = useT()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [cardRef, shake] = useShake<HTMLDivElement>()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setLoading(false)
    if (error) {
      setError(authErrorMessage(error, t))
      shake()
      return
    }
    setDone(true)
    await pause(400)
    const from = (location.state as { from?: string } | null)?.from
    navigate(from ?? '/dashboard', { replace: true })
  }

  return (
    <AuthLayout title={t.auth.login.title} cardRef={cardRef}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormError message={error} />
        <Input
          label={t.auth.email}
          type="email"
          autoComplete="email"
          required
          invalid={Boolean(error)}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <PasswordInput
          label={t.auth.password}
          autoComplete="current-password"
          required
          invalid={Boolean(error)}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="-mt-1 text-right">
          <Link to="/reset-password" className="text-sm text-muted hover:text-text">
            {t.auth.login.forgot}
          </Link>
        </div>
        <Button type="submit" loading={loading} done={done}>
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
