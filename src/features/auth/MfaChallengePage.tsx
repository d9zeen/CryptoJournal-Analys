import { useState, type FormEvent } from 'react'
import { useT } from '@/i18n'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { AuthLayout } from './AuthLayout'
import { useAuth } from './AuthProvider'
import { useFactors, useRefreshSecurity, verifyCode } from './mfa'

/** Второй шаг входа: код из приложения-аутентификатора. Без него база не отдаёт данные. */
export function MfaChallengePage() {
  const t = useT()
  const { signOut } = useAuth()
  const { data: factors } = useFactors()
  const refresh = useRefreshSecurity()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const factor = factors?.verified[0]

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!factor) return
    setError(null)
    setLoading(true)
    try {
      await verifyCode(factor.id, code)
      refresh()
    } catch {
      setError(t.security.codeWrong)
      setCode('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title={t.security.challengeTitle}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <p className="text-sm text-muted">{t.security.challengeHint}</p>
        {error && <Alert tone="error">{error}</Alert>}
        <Input
          label={t.security.code}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          required
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <Button type="submit" loading={loading} disabled={!factor}>
          {t.security.confirm}
        </Button>
        <Button type="button" variant="ghost" onClick={() => void signOut()}>
          {t.nav.logout}
        </Button>
      </form>
    </AuthLayout>
  )
}
