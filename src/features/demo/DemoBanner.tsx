/**
 * Плашка над каждой страницей дневника у гостя демо (0024): «это демо-счёт» + «Создать свой аккаунт».
 * «Создать свой аккаунт» — демо-аккаунт удаляется сразу (выдуманные сделки в настоящий аккаунт не переносим), дальше регистрация.
 * Вид — как строка апгрейда (UpgradeLine): одна строка текста, кнопка справа, без всплывающих окон.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useT } from '@/i18n'
import { useAuth } from '@/features/auth/AuthProvider'
import { leaveDemo } from './api'

export function DemoBanner() {
  const t = useT()
  const d = t.demo
  const { isGuest } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  if (!isGuest) return null
  const leave = (to: '/register' | '/welcome') => {
    setBusy(true)
    void leaveDemo(() => navigate(to, { replace: true }))
  }
  return (
    <div data-demo-banner className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-primary/40 bg-surface px-4 py-2.5 text-sm">
      <p className="min-w-0">
        <span className="font-semibold">{d.bannerTitle}</span> <span className="text-muted">{d.bannerText}</span>
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <button type="button" disabled={busy} onClick={() => leave('/welcome')} className="rounded-lg px-3 py-1.5 text-muted hover:text-text disabled:opacity-50">
          {d.exit}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => leave('/register')}
          className="rounded-lg bg-primary px-3 py-1.5 font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50"
        >
          {d.createAccount}
        </button>
      </div>
    </div>
  )
}

/** Для блоков, которых в демо нет (биржи, ссылка «поделиться», скриншоты): одна строка объяснения */
export function GuestLine({ text, className = '' }: { text: string; className?: string }) {
  const t = useT()
  const navigate = useNavigate()
  return (
    <p data-guest-line className={`flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm ${className}`}>
      <span className="text-muted">{text}</span>
      <button
        type="button"
        onClick={() => void leaveDemo(() => navigate('/register', { replace: true }))}
        className="font-medium text-primary hover:underline"
      >
        {t.demo.createAccount}
      </button>
    </p>
  )
}
