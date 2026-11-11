import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { fmt, plural, setLang, useLang, useT, type Lang } from '@/i18n'
import { planTerm } from '@/lib/plans'
import { formatDateShort } from '@/lib/format'
import { useAuth } from '@/features/auth/AuthProvider'
import { useProfile, useUpdateProfile, useUsage } from './api'
import { ListEditor } from './ListEditor'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { NumberField, SelectField, TextField } from '@/components/ui/Field'
import { parseDecimal, toInput } from '@/lib/parse'
import { dbErrorMessage } from '@/lib/errors'
import { Link, useNavigate } from 'react-router'
import { deleteMyAccount, downloadTradesCsv } from './dataApi'
import { SecurityCard } from './SecurityCard'
import { Segmented } from '@/components/ui/Segmented'
import { LANGS } from '@/lib/locale'
import { setTheme, useTheme, type Theme } from '@/lib/theme'
import { PaletteStrip } from '@/features/palette/PaletteStrip'
import { SaveButton, type SaveState } from '@/components/SaveButton'
import { pause } from '@/lib/motion'
import { useIsAdmin } from '@/features/admin/api'

export function SettingsPage() {
  const t = useT()
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t.settings.title}</h1>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <ProfileCard />
        <PlanCard />
        <AppearanceCard />
      </div>
      <SecurityCard />
      <div className="grid gap-4 lg:grid-cols-3">
        <ListEditor kind="setups" />
        <ListEditor kind="mistake_tags" />
        <ListEditor kind="emotions" />
      </div>
      <DataCard />
      <AccountRow />
    </div>
  )
}

/** Низ настроек: выход (на телефоне его больше нет в шапке) и, для админа, ссылка в админку (её нет в нижнем меню) */
function AccountRow() {
  const t = useT()
  const { signOut } = useAuth()
  const { data: isAdmin } = useIsAdmin()
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
      {isAdmin && (
        <Link to="/admin" className="rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm font-medium text-text hover:border-muted/60 md:hidden">
          {t.nav.admin}
        </Link>
      )}
      <Button variant="secondary" onClick={signOut}>
        {t.nav.logout}
      </Button>
    </div>
  )
}

function AppearanceCard() {
  const t = useT()
  const a = t.settings.appearance
  const theme = useTheme()
  const lang = useLang()
  return (
    <Card>
      <h2 className="mb-1 font-medium">{a.title}</h2>
      <p className="mb-4 text-sm text-muted">{a.hint}</p>
      <Segmented<Theme>
        label={a.theme}
        value={theme}
        onChange={setTheme}
        options={[
          { value: 'dark', label: a.dark },
          { value: 'light', label: a.light },
        ]}
      />
      <div className="mt-5">
        <Segmented<Lang>
          label={t.lang.label}
          value={lang}
          onChange={setLang}
          options={LANGS.map((l) => ({ value: l, label: t.lang.names[l] }))}
        />
      </div>
      <div className="mt-5">
        <PaletteStrip />
      </div>
    </Card>
  )
}

function ProfileCard() {
  const t = useT()
  const { user } = useAuth()
  const { data: profile } = useProfile()
  const update = useUpdateProfile()
  const [tz, setTz] = useState('UTC')
  const [balance, setBalance] = useState('')
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  const timezones = useMemo(() => {
    const list = Intl.supportedValuesOf('timeZone')
    return list.includes('UTC') ? list : ['UTC', ...list]
  }, [])

  useEffect(() => {
    if (!profile) return
    setTz(profile.timezone)
    setBalance(toInput(profile.starting_balance))
  }, [profile])

  // №15: «Сохранить» — крутилка в круге, галочка цветом прибыли
  const [saveState, setSaveState] = useState<SaveState>('idle')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setStatus(null)
    const startingBalance = balance.trim() === '' ? null : parseDecimal(balance)
    if (balance.trim() !== '' && (startingBalance === null || startingBalance < 0)) {
      setStatus({ tone: 'error', text: t.tradeForm.errors.number })
      return
    }
    setSaveState('busy')
    try {
      await update.mutateAsync({ timezone: tz, starting_balance: startingBalance })
      setSaveState('done')
      setStatus({ tone: 'success', text: t.common.saved })
      await pause(600)
    } catch (error) {
      setStatus({ tone: 'error', text: dbErrorMessage(error, t) })
    }
    setSaveState('idle')
  }

  return (
    <Card>
      <h2 className="mb-1 font-medium">{t.settings.profile}</h2>
      <p className="mb-4 text-sm text-muted">{user?.email}</p>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <SelectField label={t.settings.timezone} hint={t.settings.timezoneHint} value={tz} onChange={(e) => setTz(e.target.value)}>
          {timezones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </SelectField>
        <NumberField label={t.settings.startingBalance} hint={t.settings.startingBalanceHint} value={balance} onChange={(e) => setBalance(e.target.value)} />
        {status && <Alert tone={status.tone}>{status.text}</Alert>}
        <SaveButton state={saveState} disabled={!profile} className="self-start">
          {t.common.save}
        </SaveButton>
      </form>
    </Card>
  )
}

function PlanCard() {
  const t = useT()
  const { data: usage } = useUsage()
  const { data: profile } = useProfile()
  if (!usage) return <Card className="text-muted">{t.common.loading}</Card>
  const isPro = usage.plan !== 'free'
  const term = planTerm(profile, usage.plan)
  const pct = usage.trade_limit ? Math.min(100, (usage.trades_created / usage.trade_limit) * 100) : 0
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-medium">{t.settings.plan}</h2>
      <div className="flex items-baseline gap-2">
        <span className={`rounded-md px-2 py-0.5 text-sm font-semibold ${isPro ? 'bg-primary/15 text-primary' : 'bg-surface-2'}`}>
          {t.plans.names[usage.plan]}
        </span>
        <Link to="/plans" className="ml-auto text-sm text-primary hover:underline">
          {t.settings.plansLink}
        </Link>
      </div>
      {term && (
        <p className="text-sm">
          {term.kind === 'trial'
            ? fmt(t.plans.term.trial, { days: plural(term.daysLeft, t.plans.daysN) })
            : fmt(t.plans.term.until, { plan: t.plans.names[term.plan], date: formatDateShort(term.until) })}
        </p>
      )}
      <p className="text-sm text-muted">
        {usage.trade_limit === null
          ? fmt(t.settings.usagePro, { used: usage.trades_created })
          : fmt(t.settings.usageFree, { used: usage.trades_created, limit: usage.trade_limit })}
      </p>
      {usage.trade_limit !== null && (
        <div
          className="h-2 overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-valuenow={usage.trades_created}
          aria-valuemax={usage.trade_limit}
        >
          <div className={`h-full ${pct >= 100 ? 'bg-loss' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      {/* заглушка: оплата на сайте появится здесь (отдельный PR); пока тариф подключает владелец */}
      <div data-payment-placeholder className="rounded-lg border border-dashed border-border px-3 py-2.5 text-sm">
        <div className="font-medium">{t.settings.payment.title}</div>
        <p className="mt-0.5 text-muted">{t.settings.payment.soon}</p>
      </div>
    </Card>
  )
}

function DataCard() {
  const t = useT()
  const d = t.settings.data
  const navigate = useNavigate()
  const { user } = useAuth()
  const [exportState, setExportState] = useState<{ busy: boolean; done?: number; error?: string }>({ busy: false })
  const [confirming, setConfirming] = useState(false)
  const [typed, setTyped] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const email = user?.email ?? ''

  async function onExport() {
    setExportState({ busy: true })
    try {
      setExportState({ busy: false, done: await downloadTradesCsv() })
    } catch (e) {
      setExportState({ busy: false, error: dbErrorMessage(e, t) })
    }
  }

  async function onDelete() {
    if (!user) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteMyAccount(user.id)
      navigate('/login', { replace: true })
    } catch (e) {
      setDeleteError(dbErrorMessage(e, t))
      setDeleting(false)
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="font-medium">{d.title}</h2>
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted">{d.exportHint}</p>
        <Button variant="secondary" className="self-start" loading={exportState.busy} onClick={() => void onExport()}>
          {exportState.busy ? d.exporting : d.export}
        </Button>
        {exportState.done !== undefined && <Alert tone="success">{fmt(d.exported, { n: exportState.done })}</Alert>}
        {exportState.error && <Alert tone="error">{exportState.error}</Alert>}
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <h3 className="text-sm font-medium text-loss">{d.deleteTitle}</h3>
        <p className="text-sm text-muted">{d.deleteHint}</p>
        {!confirming ? (
          <Button variant="secondary" className="self-start" onClick={() => setConfirming(true)}>
            {d.deleteStart}
          </Button>
        ) : (
          <div className="flex flex-col gap-2 sm:max-w-sm">
            <TextField
              label={fmt(d.deleteConfirmLabel, { email })}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              inputMode="email"
            />
            <div className="flex gap-2">
              <Button
                variant="danger"
                disabled={typed.trim().toLowerCase() !== email.toLowerCase() || !email}
                loading={deleting}
                onClick={() => void onDelete()}
              >
                {deleting ? d.deleting : d.deleteConfirm}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setConfirming(false)
                  setTyped('')
                }}
                disabled={deleting}
              >
                {t.common.cancel}
              </Button>
            </div>
            {deleteError && <Alert tone="error">{deleteError}</Alert>}
          </div>
        )}
      </div>
    </Card>
  )
}
