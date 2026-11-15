import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
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
import { Link, useLocation, useNavigate } from 'react-router'
import { deleteMyAccount, downloadNotesCsv, downloadTradesCsv } from './dataApi'
import { SecurityCard } from './SecurityCard'
import { Segmented } from '@/components/ui/Segmented'
import { LANGS } from '@/lib/locale'
import { setTheme, useTheme, type Theme } from '@/lib/theme'
import { PaletteStrip } from '@/features/palette/PaletteStrip'
import type { SaveState } from '@/components/SaveButton'
import { pause } from '@/lib/motion'
import { FormActions } from '@/components/FormActions'
import { useIsAdmin } from '@/features/admin/api'

/** Вкладки настроек — порядок, ключи в адресе (/settings#security) и в словаре settings.tabs */
export const SETTINGS_TABS = ['profile', 'appearance', 'security', 'lists', 'data', 'plan'] as const
export type SettingsTab = (typeof SETTINGS_TABS)[number]

/** Значки вкладок (stroke = currentColor) */
const TAB_ICONS: Record<SettingsTab, string> = {
  profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0',
  appearance: 'M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.5 0-1.2-1-1.5-1-2.5s.7-1.5 1.7-1.5H16a5 5 0 0 0 5-5c0-4-4-7.5-9-7.5ZM7.5 11.5h.01M10 7.5h.01M15 7.5h.01',
  security: 'M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Zm-3 9 2 2 4-4',
  lists: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  data: 'M12 4c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3Zm-8 3v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  plan: 'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm0 3h18M7 15h4',
}

/**
 * Настройки — вкладками (образец 21st.dev settings-1): на компьютере (lg+) колонка вкладок слева, содержимое справа;
 * на телефоне — прокручиваемая полоса вкладок сверху (активная всегда видна целиком). Вкладка — в адресе: /settings#security.
 */
export function SettingsPage() {
  const t = useT()
  const { hash } = useLocation()
  const navigate = useNavigate()
  const { data: isAdmin } = useIsAdmin()
  const key = hash.slice(1)
  const tab: SettingsTab = (SETTINGS_TABS as readonly string[]).includes(key) ? (key as SettingsTab) : 'profile'
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t.settings.title}</h1>
      <div className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start">
        <SettingsTabs tab={tab} onSelect={(k) => navigate({ hash: `#${k}` }, { replace: true })} />
        <div role="tabpanel" id="settings-panel" aria-labelledby={`settings-tab-${tab}`} className="min-w-0">
          {tab === 'profile' && <ProfileCard />}
          {tab === 'appearance' && <AppearanceCard />}
          {tab === 'security' && <SecurityCard />}
          {tab === 'lists' && (
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              <ListEditor kind="setups" />
              <ListEditor kind="mistake_tags" />
              <ListEditor kind="emotions" />
            </div>
          )}
          {tab === 'data' && <DataCard />}
          {tab === 'plan' && <PlanCard />}
        </div>
      </div>
      {/* админка — внизу страницы на телефоне (в нижнем меню её нет), только для админа */}
      {isAdmin && (
        <div className="border-t border-border pt-4 md:hidden">
          <Link to="/admin" className="inline-block rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm font-medium text-text hover:border-muted/60">
            {t.nav.admin}
          </Link>
        </div>
      )}
    </div>
  )
}

function SettingsTabs({ tab, onSelect }: { tab: SettingsTab; onSelect: (k: SettingsTab) => void }) {
  const t = useT()
  const listRef = useRef<HTMLDivElement>(null)
  const refs = useRef<Partial<Record<SettingsTab, HTMLButtonElement | null>>>({})

  // телефон: полоса прокручивается так, чтобы активная вкладка была видна целиком (страницу не двигаем)
  useEffect(() => {
    const strip = listRef.current
    const el = refs.current[tab]
    if (!strip || !el || strip.scrollWidth <= strip.clientWidth) return
    const pad = 12
    if (el.offsetLeft < strip.scrollLeft + pad) strip.scrollLeft = el.offsetLeft - pad
    else if (el.offsetLeft + el.offsetWidth > strip.scrollLeft + strip.clientWidth - pad)
      strip.scrollLeft = el.offsetLeft + el.offsetWidth - strip.clientWidth + pad
  }, [tab])

  // стрелки переключают вкладки (как у обычных вкладок)
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!dir) return
    e.preventDefault()
    const next = SETTINGS_TABS[(SETTINGS_TABS.indexOf(tab) + dir + SETTINGS_TABS.length) % SETTINGS_TABS.length]
    onSelect(next)
    refs.current[next]?.focus()
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={t.settings.tabsLabel}
      onKeyDown={onKeyDown}
      data-shot="settings-tabs"
      className="relative -mx-4 flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 lg:sticky lg:top-6 lg:flex-col lg:overflow-visible lg:pb-0"
    >
      {SETTINGS_TABS.map((k) => {
        const on = k === tab
        return (
          <button
            key={k}
            ref={(el) => {
              refs.current[k] = el
            }}
            type="button"
            role="tab"
            id={`settings-tab-${k}`}
            aria-selected={on}
            aria-controls="settings-panel"
            tabIndex={on ? 0 : -1}
            onClick={() => onSelect(k)}
            className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm whitespace-nowrap transition-colors lg:w-full ${on ? 'border-border bg-surface font-medium text-text shadow-sm' : 'border-transparent text-muted hover:bg-surface-2/70 hover:text-text'}`}
          >
            <svg
              viewBox="0 0 24 24"
              className={`size-4 shrink-0 ${on ? 'text-primary' : ''}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d={TAB_ICONS[k]} />
            </svg>
            {t.settings.tabs[k]}
          </button>
        )
      })}
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
      <div className="grid gap-5 md:grid-cols-2">
        <Segmented<Theme>
          label={a.theme}
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'light', label: a.light },
            { value: 'dark', label: a.dark },
          ]}
        />
        <Segmented<Lang> label={t.lang.label} value={lang} onChange={setLang} options={LANGS.map((l) => ({ value: l, label: t.lang.names[l] }))} />
      </div>
      <div className="mt-5 border-t border-border pt-5">
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
  const [status, setStatus] = useState<{
    tone: 'success' | 'error'
    text: string
  } | null>(null)

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

  const dirty = Boolean(profile) && (tz !== profile!.timezone || balance !== toInput(profile!.starting_balance))
  const reset = () => {
    if (!profile) return
    setTz(profile.timezone)
    setBalance(toInput(profile.starting_balance))
    setStatus(null)
  }

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
      await update.mutateAsync({
        timezone: tz,
        starting_balance: startingBalance,
      })
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
      <h2 className="mb-4 font-medium">{t.settings.profile}</h2>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          <TextField label={t.settings.email} value={user?.email ?? ''} readOnly disabled hint={t.settings.emailHint} />
          <SelectField label={t.settings.timezone} hint={t.settings.timezoneHint} value={tz} onChange={(e) => setTz(e.target.value)}>
            {timezones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </SelectField>
          <NumberField label={t.settings.startingBalance} hint={t.settings.startingBalanceHint} value={balance} onChange={(e) => setBalance(e.target.value)} />
        </div>
        {status && <Alert tone={status.tone}>{status.text}</Alert>}
        <FormActions dirty={dirty} state={saveState} onCancel={reset} />
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
    <Card className="grid gap-5 md:grid-cols-2">
      <div className="flex flex-col gap-3">
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
              ? fmt(t.plans.term.trial, {
                  days: plural(term.daysLeft, t.plans.daysN),
                })
              : fmt(t.plans.term.until, {
                  plan: t.plans.names[term.plan],
                  date: formatDateShort(term.until),
                })}
          </p>
        )}
        <p className="text-sm text-muted">
          {usage.trade_limit === null
            ? fmt(t.settings.usagePro, { used: usage.trades_created })
            : fmt(t.settings.usageFree, {
                used: usage.trades_created,
                limit: usage.trade_limit,
              })}
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
      </div>
      {/* заглушка: оплата на сайте появится здесь (отдельный PR); идёт пробный период — до какого числа */}
      <div data-payment-placeholder className="self-start rounded-lg border border-dashed border-border px-3 py-2.5 text-sm">
        <div className="font-medium">{t.settings.payment.title}</div>
        <p className="mt-0.5 text-muted">{t.settings.payment.soon}</p>
        {term?.kind === 'trial' && (
          <p className="mt-0.5">
            {fmt(t.settings.payment.trial, {
              date: formatDateShort(term.until),
            })}
          </p>
        )}
      </div>
    </Card>
  )
}

function DataCard() {
  const t = useT()
  const d = t.settings.data
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const [exportState, setExportState] = useState<{
    busy: boolean
    done?: number
    error?: string
  }>({ busy: false })
  const [notesState, setNotesState] = useState<{
    busy: boolean
    done?: number
    error?: string
  }>({ busy: false })
  const [confirming, setConfirming] = useState(false)
  const [typed, setTyped] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const email = user?.email ?? ''

  async function onExportNotes() {
    setNotesState({ busy: true })
    try {
      setNotesState({ busy: false, done: await downloadNotesCsv() })
    } catch (e) {
      setNotesState({ busy: false, error: dbErrorMessage(e, t) })
    }
  }

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
    <div className="flex flex-col gap-4">
      <Card className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h2 className="font-medium">{d.title}</h2>
          <p className="text-sm text-muted">{d.exportHint}</p>
          <Button variant="secondary" className="self-start" loading={exportState.busy} onClick={() => void onExport()}>
            {exportState.busy ? d.exporting : d.export}
          </Button>
          {exportState.done !== undefined && <Alert tone="success">{fmt(d.exported, { n: exportState.done })}</Alert>}
          {exportState.error && <Alert tone="error">{exportState.error}</Alert>}
          {/* заметки дня из календаря — отдельным файлом (у них свои колонки: день, текст) */}
          <Button variant="secondary" className="self-start" loading={notesState.busy} onClick={() => void onExportNotes()}>
            {d.exportNotes}
          </Button>
          {notesState.done !== undefined && <Alert tone="success">{fmt(d.exportedNotes, { n: notesState.done })}</Alert>}
          {notesState.error && <Alert tone="error">{notesState.error}</Alert>}
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
          <h3 className="font-medium text-loss">{d.deleteTitle}</h3>
          <p className="text-sm text-muted">{d.deleteHint}</p>
          {!confirming ? (
            <Button variant="dangerOutline" className="self-start" onClick={() => setConfirming(true)}>
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
      {/* выход — здесь (на телефоне его нет в шапке) */}
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium">{d.logoutTitle}</h2>
          <p className="text-sm text-muted">{d.logoutHint}</p>
        </div>
        <Button variant="secondary" onClick={signOut}>
          {t.nav.logout}
        </Button>
      </Card>
    </div>
  )
}
