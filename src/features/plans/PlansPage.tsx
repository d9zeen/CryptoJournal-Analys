/**
 * Тарифы: Basic (бесплатно), Pro, Pro Plus — одна таблица сравнения (строки — возможности, колонки — тарифы).
 * Переключатель «Месяц / Год». Оплаты на сайте пока нет (будет отдельным шагом). Pro Plus — главный (выделен);
 * колонка текущего тарифа подписана «Твой тариф».
 */
import { Fragment, useState, type ReactNode } from 'react'
import { fmt, plural, useT } from '@/i18n'
import { useProfile, useUsage } from '@/features/settings/api'
import { Card } from '@/components/ui/Card'
import { MAIN_PLAN, PLANS, planTerm, type Billing, type PlanInfo } from '@/lib/plans'
import type { Plan } from '@/types/db'
import { BillingToggle } from './BillingToggle'
import { PlanPrice } from './PlanPrice'

export function PlansPage() {
  const t = useT()
  const p = t.plans
  const { data: usage } = useUsage()
  const { data: profile } = useProfile()
  const [billing, setBilling] = useState<Billing>('month')
  const term = planTerm(profile, usage?.plan)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{p.title}</h1>
          <p className="mt-1 text-sm text-muted">{p.hint}</p>
        </div>
        <BillingToggle value={billing} onChange={setBilling} />
      </div>
      <PlansTable
        current={usage?.plan}
        currentNote={
          term ? (term.kind === 'trial' ? `${p.trial} · ${plural(term.daysLeft, p.daysN)}` : fmt(p.until, { date: term.until.toLocaleDateString('ru-RU') })) : null
        }
        billing={billing}
      />
      <p className="text-sm text-muted">{p.founder}</p>
    </div>
  )
}

/** Таблица сравнения тарифов */
export function PlansTable({ current, currentNote = null, billing }: { current?: Plan; currentNote?: string | null; billing: Billing }) {
  const t = useT()
  const p = t.plans
  const f = p.features
  const flag = (on: boolean) => (on ? <span>{p.yes}</span> : <span className="text-muted">{p.no}</span>)
  const num = (v: ReactNode) => <span className="num font-semibold">{v}</span>
  const rows: { label: string; cell: (plan: PlanInfo) => ReactNode }[] = [
    { label: f.trades, cell: (plan) => num(plan.tradeLimit ?? f.tradesUnlimited) },
    { label: f.base, cell: () => flag(true) },
    { label: f.connections, cell: (plan) => num(plan.connections || '—') },
    { label: f.exchanges, cell: (plan) => flag(plan.exchanges) },
    { label: f.polymarket, cell: (plan) => flag(plan.polymarket) },
    { label: f.sync, cell: (plan) => (plan.serverSync ? f.syncServer : plan.connections ? f.syncOpen : <span className="text-muted">{f.syncNone}</span>) },
    { label: f.screenshots, cell: (plan) => num(plan.screenshots) },
    { label: f.palettes, cell: (plan) => (plan.allPalettes ? f.palettesAll : f.palettesFree) },
    { label: f.early, cell: (plan) => flag(plan.earlyAccess) },
  ]
  // главный тариф (Pro Plus) — колонка в рамке; над ней — плашка «Всё автоматически»
  const col = (plan: PlanInfo, edge?: 'top' | 'bottom') =>
    plan.id === MAIN_PLAN
      ? `border-x border-primary/60 bg-surface-2/40 ${edge === 'top' ? 'border-t rounded-t-lg' : ''} ${edge === 'bottom' ? 'border-b rounded-b-lg' : ''}`
      : ''

  return (
    <Card className="rise !p-0">
      <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th scope="col" className="hidden w-2/5 px-4 pt-4 pb-3 text-left align-bottom text-xs font-normal text-muted md:table-cell">
              {p.feature}
            </th>
            {PLANS.map((plan) => (
              <th key={plan.id} scope="col" className={`px-3 pt-4 pb-3 text-left align-top font-normal md:px-4 ${col(plan, 'top')}`}>
                {/* плашка над главным тарифом (с md; на телефоне колонка узкая — хватает рамки); у остальных — пустое место той же высоты */}
                {plan.id === MAIN_PLAN ? (
                  <span className="mb-2 hidden rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-on-primary md:inline-block">{p.best}</span>
                ) : (
                  <span className="mb-2 hidden h-[22px] md:block" aria-hidden />
                )}
                <h2 className="text-base font-bold">{p.names[plan.id]}</h2>
                <div className="mt-0.5">
                  <PlanPrice plan={plan} billing={billing} />
                </div>
                {current === plan.id && (
                  <p className="mt-1 text-xs text-primary">
                    {p.current}
                    {currentNote && plan.id !== 'free' ? ` · ${currentNote}` : ''}
                  </p>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <Fragment key={r.label}>
              <tr className="md:hidden">
                <td colSpan={PLANS.length} className="border-t border-border px-3 pt-3 text-xs text-muted">
                  {r.label}
                </td>
              </tr>
              <tr>
                <th scope="row" className="hidden border-t border-border px-4 py-3 text-left font-normal text-muted md:table-cell">
                  {r.label}
                </th>
                {PLANS.map((plan) => (
                  <td
                    key={plan.id}
                    className={`px-3 pt-1 pb-3 md:border-t md:border-t-border md:px-4 md:pt-3 ${col(plan, i === rows.length - 1 ? 'bottom' : undefined)}`}
                  >
                    {r.cell(plan)}
                  </td>
                ))}
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
