import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { supabase } from '@/lib/supabase'
import { fmt, useT } from '@/i18n'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { FormError } from '@/components/FormError'
import { useShake } from '@/lib/motion'
import { CheckEmail } from './CheckEmail'
import { AuthLayout } from './AuthLayout'
import { authErrorMessage } from './errors'
import { appUrl } from '@/lib/url'

/** Шаг 1: пользователь вводит email, получает письмо со ссылкой на /update-password */
export function ResetPasswordPage() {
  const t = useT()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [cardRef, shake] = useShake<HTMLDivElement>()

  const send = async (to: string) => (await supabase.auth.resetPasswordForEmail(to, { redirectTo: appUrl('update-password') })).error

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const to = email.trim()
    const error = await send(to)
    setLoading(false)
    if (error) {
      setError(authErrorMessage(error, t))
      shake()
      return
    }
    setSent(to)
  }

  return (
    <AuthLayout title={t.auth.reset.title} cardRef={cardRef}>
      {sent ? (
        // №6: «Проверь почту» и «Отправить ещё раз» (через 0:30)
        <CheckEmail
          text={fmt(t.auth.checkEmail.reset, { email: sent })}
          onResend={async () => {
            const error = await send(sent)
            return error ? authErrorMessage(error, t) : null
          }}
        />
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <p className="text-sm text-muted">{t.auth.reset.hint}</p>
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
