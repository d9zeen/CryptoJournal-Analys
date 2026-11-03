import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { fmt, useT } from '@/i18n'
import { useAuth } from '@/features/auth/AuthProvider'
import { useProfile, useUpdateProfile, useUsage } from './api'
import { ListEditor } from './ListEditor'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { NumberField, SelectField, TextField } from '@/components/ui/Field'
import { parseDecimal, toInput } from '@/lib/parse'
import { dbErrorMessage } from '@/lib/errors'

export function SettingsPage() {
  const t = useT()
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t.settings.title}</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        <ProfileCard />
        <PlanCard />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <ListEditor kind="setups" />
        <ListEditor kind="mistake_tags" />
        <ListEditor kind="emotions" />
      </div>
    </div>
  )
}

function ProfileCard() {
  const t = useT()
  const { user } = useAuth()
  const { data: profile } = useProfile()
  const update = useUpdateProfile()
  const [name, setName] = useState('')
  const [tz, setTz] = useState('UTC')
  const [balance, setBalance] = useState('')
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  const timezones = useMemo(() => {
    const list = Intl.supportedValuesOf('timeZone')
    return list.includes('UTC') ? list : ['UTC', ...list]
  }, [])

  useEffect(() => {
    if (!profile) return
    setName(profile.display_name ?? '')
    setTz(profile.timezone)
    setBalance(toInput(profile.starting_balance))
  }, [profile])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setStatus(null)
    const startingBalance = balance.trim() === '' ? null : parseDecimal(balance)
    if (balance.trim() !== '' && (startingBalance === null || startingBalance < 0)) {
      setStatus({ tone: 'error', text: t.tradeForm.errors.number })
      return
    }
    try {
      await update.mutateAsync({ display_name: name.trim() || null, timezone: tz, starting_balance: startingBalance })
      setStatus({ tone: 'success', text: t.common.saved })
    } catch (error) {
      setStatus({ tone: 'error', text: dbErrorMessage(error, t) })
    }
  }

  return (
    <Card>
      <h2 className="mb-1 font-medium">{t.settings.profile}</h2>
      <p className="mb-4 text-sm text-muted">{user?.email}</p>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <TextField label={t.settings.displayName} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        <SelectField label={t.settings.timezone} hint={t.settings.timezoneHint} value={tz} onChange={(e) => setTz(e.target.value)}>
          {timezones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </SelectField>
        <NumberField label={t.settings.startingBalance} hint={t.settings.startingBalanceHint} value={balance} onChange={(e) => setBalance(e.target.value)} />
        {status && <Alert tone={status.tone}>{status.text}</Alert>}
        <Button type="submit" loading={update.isPending} disabled={!profile} className="self-start">
          {t.common.save}
        </Button>
      </form>
    </Card>
  )
}

function PlanCard() {
  const t = useT()
  const { data: usage } = useUsage()
  const { data: profile } = useProfile()
  if (!usage) return <Card className="text-muted">{t.common.loading}</Card>
  const isPro = usage.plan === 'pro'
  const pct = usage.trade_limit ? Math.min(100, (usage.trades_created / usage.trade_limit) * 100) : 0
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-medium">{t.settings.plan}</h2>
      <div className="flex items-baseline gap-2">
        <span className={`rounded-md px-2 py-0.5 text-sm font-semibold ${isPro ? 'bg-primary/15 text-primary' : 'bg-surface-2'}`}>
          {isPro ? t.settings.planPro : t.settings.planFree}
        </span>
        {isPro && profile?.plan_until && (
          <span className="text-sm text-muted">{fmt(t.settings.planUntil, { date: new Date(profile.plan_until).toLocaleDateString('ru-RU') })}</span>
        )}
      </div>
      <p className="text-sm text-muted">
        {usage.trade_limit === null
          ? fmt(t.settings.usagePro, { used: usage.trades_created })
          : fmt(t.settings.usageFree, { used: usage.trades_created, limit: usage.trade_limit })}
      </p>
      {usage.trade_limit !== null && (
        <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={usage.trades_created} aria-valuemax={usage.trade_limit}>
          <div className={`h-full ${pct >= 100 ? 'bg-loss' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </Card>
  )
}
