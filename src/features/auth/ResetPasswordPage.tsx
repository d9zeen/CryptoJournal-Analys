import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { supabase } from '@/lib/supabase'
import { useT } from '@/i18n'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { AuthLayout } from './AuthLayout'
import { authErrorMessage } from './errors'

/** Шаг 1: пользователь вводит email, получает письмо со ссылкой на /update-password */
export function ResetPasswordPage() {
  const t = useT()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/update-password`,
    })
    setLoading(false)
    if (error) return setError(authErrorMessage(error, t))
    setSent(true)
  }

  return (
    <AuthLayout title={t.auth.reset.title}>
      {sent ? (
        <Alert tone="success">{t.auth.reset.sent}</Alert>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <p className="text-sm text-muted">{t.auth.reset.hint}</p>
          {error && <Alert tone="error">{error}</Alert>}
          <Input label={t.auth.email} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" loading={loading}>
            {t.auth.reset.submit}
          </Button>
        </form>
      )}
      <Link to="/login" className="mt-4 block text-center text-sm text-muted hover:text-text">
        {t.auth.reset.back}
      </Link>
    </AuthLayout>
  )
}
