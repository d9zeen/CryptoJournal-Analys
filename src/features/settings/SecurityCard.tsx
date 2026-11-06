import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useT } from '@/i18n'
import { supabase } from '@/lib/supabase'
import { queryClient } from '@/lib/queryClient'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { TextField } from '@/components/ui/Field'
import { authErrorMessage, passwordProblem } from '@/features/auth/errors'
import { cancelEnroll, disableFactor, startEnroll, useFactors, useRefreshSecurity, verifyCode, type Enrollment } from '@/features/auth/mfa'
import type { AuthError } from '@supabase/supabase-js'

/** Безопасность аккаунта: 2FA, смена пароля, выход на всех устройствах */
export function SecurityCard() {
  const t = useT()
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="font-medium">{t.security.title}</h2>
      <div className="grid gap-6 lg:grid-cols-3">
        <MfaBlock />
        <PasswordBlock />
        <SessionsBlock />
      </div>
    </Card>
  )
}

function MfaBlock() {
  const t = useT()
  const s = t.security
  const { data: factors, isLoading } = useFactors()
  const refresh = useRefreshSecurity()
  const [enroll, setEnroll] = useState<Enrollment | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const active = factors?.verified[0]

  async function begin() {
    setMsg(null)
    setBusy(true)
    try {
      setEnroll(await startEnroll())
    } catch (e) {
      setMsg({ tone: 'error', text: authErrorMessage(e as AuthError, t) })
    } finally {
      setBusy(false)
    }
  }

  async function confirm(e: FormEvent) {
    e.preventDefault()
    if (!enroll) return
    setBusy(true)
    setMsg(null)
    try {
      await verifyCode(enroll.factorId, code)
      setEnroll(null)
      setCode('')
      setMsg({ tone: 'success', text: s.mfaEnabled })
      refresh()
    } catch {
      setMsg({ tone: 'error', text: s.codeWrong })
    } finally {
      setBusy(false)
    }
  }

  async function cancel() {
    if (enroll) await cancelEnroll(enroll.factorId)
    setEnroll(null)
    setCode('')
  }

  async function disable() {
    if (!active || !window.confirm(s.mfaDisableConfirm)) return
    setBusy(true)
    setMsg(null)
    try {
      await disableFactor(active.id)
      refresh()
    } catch (e) {
      setMsg({ tone: 'error', text: authErrorMessage(e as AuthError, t) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">{s.mfaTitle}</h3>
      {!isLoading && <p className={`text-sm ${active ? 'text-profit' : 'text-warning'}`}>{active ? s.mfaOn : s.mfaOff}</p>}

      {enroll ? (
        <form onSubmit={confirm} className="flex flex-col gap-3">
          <p className="text-sm text-muted">{s.mfaStep1}</p>
          <img src={enroll.qr} alt="QR" className="size-44 self-start rounded-lg bg-text p-2" />
          <p className="text-xs text-muted">
            {s.mfaSecret} <code className="select-all break-all text-text">{enroll.secret}</code>
          </p>
          <TextField
            label={s.mfaStep2}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <div className="flex gap-2">
            <Button type="submit" loading={busy}>
              {s.confirm}
            </Button>
            <Button type="button" variant="ghost" onClick={() => void cancel()} disabled={busy}>
              {t.common.cancel}
            </Button>
          </div>
        </form>
      ) : active ? (
        <Button variant="secondary" className="self-start" onClick={() => void disable()} loading={busy}>
          {s.mfaDisable}
        </Button>
      ) : (
        <Button className="self-start" onClick={() => void begin()} loading={busy} disabled={isLoading}>
          {s.mfaEnable}
        </Button>
      )}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </section>
  )
}

function PasswordBlock() {
  const t = useT()
  const s = t.security
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    const problem = passwordProblem(pw)
    if (problem) return setMsg({ tone: 'error', text: t.auth.errors.passwordShort })
    if (pw !== pw2) return setMsg({ tone: 'error', text: t.auth.errors.passwordMismatch })
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) return setMsg({ tone: 'error', text: authErrorMessage(error, t) })
    setPw('')
    setPw2('')
    setMsg({ tone: 'success', text: s.passwordChanged })
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">{s.passwordTitle}</h3>
      <TextField label={s.passwordNew} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} hint={s.passwordHint} />
      <TextField label={s.passwordRepeat} type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
      <Button type="submit" variant="secondary" className="self-start" loading={busy} disabled={!pw}>
        {s.passwordSave}
      </Button>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </form>
  )
}

function SessionsBlock() {
  const t = useT()
  const s = t.security
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  async function signOutAll() {
    setBusy(true)
    // global — отзывает все сессии этого аккаунта на всех устройствах
    await supabase.auth.signOut({ scope: 'global' })
    queryClient.clear()
    navigate('/login', { replace: true })
  }

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">{s.sessionsTitle}</h3>
      <p className="text-sm text-muted">{s.sessionsHint}</p>
      <Button variant="secondary" className="self-start" onClick={() => void signOutAll()} loading={busy}>
        {s.signOutAll}
      </Button>
    </section>
  )
}
