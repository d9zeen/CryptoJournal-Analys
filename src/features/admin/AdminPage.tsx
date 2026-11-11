/**
 * Админка: все пользователи, их тарифы и сделки; выдать / снять Pro, сбросить лимит Free.
 * Доступ проверяет база (is_admin в каждой функции) — интерфейс лишь прячет пункт меню у остальных.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { fmt, useT } from '@/i18n'
import { useAuth } from '@/features/auth/AuthProvider'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { Input } from '@/components/ui/Input'
import { formatDateTime, formatNumber } from '@/lib/format'
import { dbErrorMessage } from '@/lib/errors'
import { useMediaQuery } from '@/lib/useMediaQuery'
import type { AdminUser, Plan } from '@/types/db'
import { planInfo } from '@/lib/plans'
import { SelectField } from '@/components/ui/Field'
import { useAdminResetUsage, useAdminSetAdmin, useAdminSetPlan, useAdminUsers, useIsAdmin } from './api'

const dateOnly = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })

export function AdminPage() {
  const t = useT()
  const a = t.admin
  const { user } = useAuth()
  const { data: isAdmin, isLoading: checking } = useIsAdmin()
  const { data: users = [], isLoading, error } = useAdminUsers(isAdmin === true)
  const setPlan = useAdminSetPlan()
  const resetUsage = useAdminResetUsage()
  const setAdmin = useAdminSetAdmin()
  const desktop = useMediaQuery('(min-width: 1024px)')
  const [query, setQuery] = useState('')
  const [giveTo, setGiveTo] = useState<Plan>('pro_plus')
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? users.filter((u) => (u.email ?? '').toLowerCase().includes(q)) : users
  }, [users, query])

  const totals = useMemo(
    () => ({
      users: users.length,
      pro: users.filter((u) => u.effective_plan !== 'free').length,
      month: users.reduce((s, u) => s + u.trades_month, 0),
      total: users.reduce((s, u) => s + Number(u.trades_total), 0),
    }),
    [users],
  )

  async function run(action: () => Promise<void>, ok: string) {
    setStatus(null)
    try {
      await action()
      setStatus({ tone: 'success', text: ok })
    } catch (e) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : ''
      const known = (['CANNOT_REMOVE_SELF', 'LAST_ADMIN'] as const).find((c) => msg.includes(c))
      setStatus({ tone: 'error', text: known ? a.errors[known] : dbErrorMessage(e, t) })
    }
  }

  const actions = (u: AdminUser) => {
    const email = u.email ?? u.id
    const busy = setPlan.isPending || resetUsage.isPending || setAdmin.isPending
    const small0 = '!px-2.5 !py-1.5 text-xs'
    // админ всегда работает без лимитов — выдавать / снимать тариф ему не нужно; админку можно снять (кроме себя)
    if (u.is_admin)
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted">{a.unlimitedHint}</span>
          {u.id !== user?.id && (
            <Button
              variant="ghost"
              className={small0}
              disabled={busy}
              onClick={() => window.confirm(fmt(a.removeAdminConfirm, { email })) && run(() => setAdmin.mutateAsync({ userId: u.id, admin: false }), fmt(a.done.adminRemoved, { email }))}
            >
              {a.removeAdmin}
            </Button>
          )}
        </div>
      )
    const small = '!px-2.5 !py-1.5 text-xs'
    // срок: месяц и год — от сегодня (календарные), бессрочно — без даты
    const addMonths = (n: number) => {
      const d = new Date()
      d.setMonth(d.getMonth() + n)
      return d.toISOString()
    }
    const give = (until: string | null) =>
      run(() => setPlan.mutateAsync({ userId: u.id, plan: giveTo, until }), fmt(a.done.give, { email, plan: t.plans.names[giveTo] }))
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold text-text">{t.plans.names[giveTo]}:</span>
        <Button className={small} disabled={busy} onClick={() => give(addMonths(1))}>
          {a.giveMonth}
        </Button>
        <Button className={small} disabled={busy} onClick={() => give(addMonths(12))}>
          {a.giveYear}
        </Button>
        <Button variant="secondary" className={small} disabled={busy} onClick={() => give(null)}>
          {a.giveForever}
        </Button>
        {u.effective_plan !== 'free' && (
          <Button variant="secondary" className={small} disabled={busy} onClick={() => run(() => setPlan.mutateAsync({ userId: u.id, plan: 'free', until: null }), fmt(a.done.remove, { email }))}>
            {a.removePro}
          </Button>
        )}
        <Button variant="ghost" className={small} disabled={busy || u.trades_month === 0} onClick={() => run(() => resetUsage.mutateAsync(u.id), fmt(a.done.reset, { email }))}>
          {a.resetLimit}
        </Button>
        <Button
          variant="ghost"
          className={small}
          disabled={busy}
          onClick={() => window.confirm(fmt(a.makeAdminConfirm, { email })) && run(() => setAdmin.mutateAsync({ userId: u.id, admin: true }), fmt(a.done.adminGiven, { email }))}
        >
          {a.makeAdmin}
        </Button>
      </div>
    )
  }

  const planBadge = (u: AdminUser) => {
    if (u.is_admin) return <span className="rounded-md bg-primary/15 px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-primary">{a.unlimited}</span>
    const paid = u.effective_plan !== 'free'
    const name = t.plans.names[paid ? u.effective_plan : u.plan]
    const text = paid
      ? u.plan_until
        ? fmt(a.planUntil, { plan: name, d: dateOnly.format(new Date(u.plan_until)) })
        : fmt(a.planForever, { plan: name })
      : u.plan !== 'free' && u.plan_until
        ? fmt(a.planExpired, { plan: name, d: dateOnly.format(new Date(u.plan_until)) })
        : a.free
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        <span className={`rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${paid ? 'bg-primary/15 text-primary' : 'bg-surface-2 text-muted'}`}>{text}</span>
        {paid && u.plan_trial && <span className="rounded-md border border-border px-1.5 py-0.5 text-xs whitespace-nowrap text-muted">{a.trialBadge}</span>}
      </span>
    )
  }

  const monthCell = (u: AdminUser) => {
    const limit = u.is_admin ? null : planInfo(u.effective_plan).tradeLimit
    const full = limit !== null && u.trades_month >= limit
    return (
      <span className={`num ${full ? 'text-loss' : ''}`}>
        {u.trades_month}
        {limit !== null && <span className="text-muted"> / {limit}</span>}
      </span>
    )
  }

  const who = (u: AdminUser) => (
    <div className="min-w-0">
      <div className="truncate font-medium">{u.email ?? u.id}</div>
      <div className="mt-0.5 flex gap-1.5 text-xs">
        {u.id === user?.id && <span className="text-accent">{a.you}</span>}
        {u.is_admin && <span className="text-primary">{a.adminBadge}</span>}
      </div>
    </div>
  )

  if (checking) return <p className="text-muted">{t.common.loading}</p>
  if (!isAdmin)
    return (
      <Card>
        <h1 className="mb-2 text-xl font-semibold">{a.title}</h1>
        <p className="text-muted">{a.noAccess}</p>
      </Card>
    )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{a.title}</h1>
          <p className="mt-1 text-sm text-muted">{a.hint}</p>
        </div>
        <div className="flex w-full flex-wrap gap-3 sm:w-auto">
          <div className="w-full sm:w-44">
            <SelectField label={a.planToGive} value={giveTo} onChange={(e) => setGiveTo(e.target.value as Plan)}>
              <option value="pro">{t.plans.names.pro}</option>
              <option value="pro_plus">{t.plans.names.pro_plus}</option>
            </SelectField>
          </div>
          <div className="w-full sm:w-72">
            <Input label={a.search} value={query} onChange={(e) => setQuery(e.target.value)} type="search" />
          </div>
        </div>
      </div>

      <section className="rise grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-4">
        <Stat label={a.stats.users} value={formatNumber(totals.users, 0)} />
        <Stat label={a.stats.pro} value={formatNumber(totals.pro, 0)} tone="text-primary" />
        <Stat label={a.stats.month} value={formatNumber(totals.month, 0)} />
        <Stat label={a.stats.total} value={formatNumber(totals.total, 0)} />
      </section>

      {status && <Alert tone={status.tone}>{status.text}</Alert>}
      {error && <Alert tone="error">{t.errors.loadFailed}</Alert>}

      {isLoading ? (
        <p className="text-muted">{t.common.loading}</p>
      ) : shown.length === 0 ? (
        <Card className="text-center text-muted">{a.empty}</Card>
      ) : desktop ? (
        <div className="rise overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs text-muted">
              <tr>
                {[a.cols.email, a.cols.created, a.cols.lastSignIn, a.cols.plan].map((h) => (
                  <th key={h} className="px-4 py-3 font-normal">
                    {h}
                  </th>
                ))}
                <th className="px-4 py-3 text-right font-normal">{a.cols.month}</th>
                <th className="px-4 py-3 text-right font-normal">{a.cols.total}</th>
                <th className="px-4 py-3 font-normal">{a.cols.actions}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((u) => (
                <tr key={u.id} className="border-t border-border align-middle">
                  <td className="max-w-72 px-4 py-3">{who(u)}</td>
                  <td className="num px-4 py-3 text-xs whitespace-nowrap text-muted">{formatDateTime(u.created_at)}</td>
                  <td className="num px-4 py-3 text-xs whitespace-nowrap text-muted">{u.last_sign_in_at ? formatDateTime(u.last_sign_in_at) : a.never}</td>
                  <td className="px-4 py-3">{planBadge(u)}</td>
                  <td className="px-4 py-3 text-right">{monthCell(u)}</td>
                  <td className="num px-4 py-3 text-right">{formatNumber(Number(u.trades_total), 0)}</td>
                  <td className="px-4 py-3">{actions(u)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((u) => (
            <li key={u.id}>
              <Card className="flex flex-col gap-3 !p-4">
                <div className="flex items-start justify-between gap-3">
                  {who(u)}
                  {planBadge(u)}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted">
                  <Field label={a.cols.month}>{monthCell(u)}</Field>
                  <Field label={a.cols.total}>
                    <span className="num">{formatNumber(Number(u.trades_total), 0)}</span>
                  </Field>
                  <Field label={a.cols.created}>
                    <span className="num">{formatDateTime(u.created_at)}</span>
                  </Field>
                  <Field label={a.cols.lastSignIn}>
                    <span className="num">{u.last_sign_in_at ? formatDateTime(u.last_sign_in_at) : a.never}</span>
                  </Field>
                </div>
                {actions(u)}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Stat({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-1 bg-surface p-4">
      <span className="text-xs text-muted">{label}</span>
      <span className={`num text-xl font-semibold ${tone}`}>{value}</span>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div>{label}</div>
      <div className="mt-0.5 text-sm text-text">{children}</div>
    </div>
  )
}
