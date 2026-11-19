/**
 * «Продолжить с Google» над формой входа / регистрации + черта «или». Видна, только если вход через Google включён (lib/authProviders).
 * Вход — переход на страницу Google и обратно в дневник (redirectTo — адрес дашборда; он должен быть в Supabase → Redirect URLs).
 */
import { useState } from 'react'
import { useT } from '@/i18n'
import { supabase } from '@/lib/supabase'
import { appUrl } from '@/lib/url'
import { GOOGLE_LOGIN } from '@/lib/authProviders'
import googleLogo from '@/assets/auth/google.svg'

export function OAuthButtons() {
  const t = useT()
  const o = t.auth.oauth
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  if (!GOOGLE_LOGIN) return null
  async function google() {
    setBusy(true)
    setFailed(false)
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: appUrl('dashboard') } })
    // при успехе браузер уже уходит на Google; ошибка — остаёмся здесь
    if (error) {
      setBusy(false)
      setFailed(true)
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        data-oauth="google"
        onClick={google}
        disabled={busy}
        className="flex items-center justify-center gap-2.5 rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-sm font-semibold text-text transition-colors hover:border-muted/60 disabled:opacity-60"
      >
        <img src={googleLogo} alt="" className="size-[18px]" />
        {o.google}
      </button>
      {failed && <p className="text-xs text-loss">{o.failed}</p>}
      <div className="flex items-center gap-3 text-xs text-muted" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        {o.or}
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  )
}
