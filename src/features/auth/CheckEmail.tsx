/**
 * №6 «Проверь почту»: форма свернулась, рисуется галочка в круге, email, кнопка «Отправить ещё раз» с таймером 0:30.
 * resend — регистрация: supabase.auth.resend; восстановление пароля: resetPasswordForEmail ещё раз.
 */
import { useEffect, useState } from 'react'
import { fmt, useT } from '@/i18n'
import { Button } from '@/components/ui/Button'
import { CheckMark } from '@/components/CheckMark'
import { FormError } from '@/components/FormError'

const WAIT = 30

export function CheckEmail({ text, onResend }: { text: string; onResend: () => Promise<string | null> }) {
  const t = useT()
  const c = t.auth.checkEmail
  // таймер считаем от времени окончания (а не «минус секунда каждую секунду»): вкладка в фоне не сбивает счёт
  const [until, setUntil] = useState(() => Date.now() + WAIT * 1000)
  const [left, setLeft] = useState(WAIT)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const tick = () => setLeft(Math.max(0, Math.ceil((until - Date.now()) / 1000)))
    tick()
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [until])

  async function resend() {
    setBusy(true)
    setError(null)
    setNote(null)
    const err = await onResend()
    setBusy(false)
    if (err) return setError(err)
    setNote(c.resent)
    setUntil(Date.now() + WAIT * 1000)
  }

  const time = `0:${String(left).padStart(2, '0')}`
  return (
    <div data-check-email className="animate-fade-in flex flex-col items-center gap-3 text-center">
      <CheckMark circle className="size-16 text-profit" />
      <h2 className="text-lg font-semibold">{c.title}</h2>
      <p className="text-sm text-text/85">{text}</p>
      <p className="text-xs text-muted">{c.spam}</p>
      <FormError message={error} />
      {note && <p className="text-sm text-profit">{note}</p>}
      <Button type="button" variant="secondary" className="mt-1 w-full" disabled={left > 0} loading={busy} onClick={() => void resend()}>
        <span className="num">{left > 0 ? fmt(c.resendIn, { time }) : c.resend}</span>
      </Button>
    </div>
  )
}
