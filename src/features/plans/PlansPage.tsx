/**
 * Тарифы: Basic (бесплатно), Pro, Pro Plus — одна таблица сравнения (строки — возможности, колонки — тарифы).
 * Оплаты пока нет: тариф выдаёт админ. Колонка текущего тарифа выделена рамкой.
 */
import { Fragment, useState } from 'react'
import { fmt, useT } from '@/i18n'
import { useProfile, useUsage } from '@/features/settings/api'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { PLANS, type PlanInfo } from '@/lib/plans'

export function PlansPage() {
  const t = useT()
  const p = t.plans
  const { data: usage } = useUsage()
  const { data: profile } = useProfile()
  const [asked, setAsked] = useState(false)

  const flag = (on: boolean) => (on ? <span>{p.yes}</span> : <span className="text-muted">{p.no}</span>)
  const rows: { label: string; cell: (plan: PlanInfo) => React.ReactNode }[] = [
    {
      label: p.features.trades,
      cell: (plan) => <span className="num font-semibold">{plan.tradeLimit ?? p.features.tradesUnlimited}</span>,
    },
    { label: p.features.base, cell: () => flag(true) },
    { label: p.features.polymarket, cell: (plan) => flag(plan.polymarket) },
    { label: p.features.exchanges, cell: (plan) => flag(plan.exchanges) },
    { label: p.features.serverSync, cell: (plan) => flag(plan.serverSync) },
  ]
  const isCurrent = (plan: PlanInfo) => usage?.plan === plan.id
  // рамка вокруг колонки текущего тарифа: боковые линии в каждой ячейке, верх — в шапке, низ — в последней строке
  const col = (plan: PlanInfo, edge?: 'top' | 'bottom') =>
    isCurrent(plan)
      ? `border-x border-primary/60 bg-surface-2/40 ${edge === 'top' ? 'border-t rounded-t-lg' : ''} ${edge === 'bottom' ? 'border-b rounded-b-lg' : ''}`
      : ''

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">{p.title}</h1>
        <p className="mt-1 text-sm text-muted">{p.hint}</p>
      </div>
      {asked && <Alert tone="info">{p.contact}</Alert>}
      {/* на телефоне название строки — отдельной строкой над значениями, чтобы три тарифа влезли без прокрутки вбок */}
      <Card className="rise !p-0">
        <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th scope="col" className="hidden w-2/5 px-4 pt-4 pb-3 text-left align-bottom text-xs font-normal text-muted md:table-cell">
                {p.feature}
              </th>
              {PLANS.map((plan) => (
                <th key={plan.id} scope="col" className={`px-3 pt-4 pb-3 text-left align-top font-normal md:px-4 ${col(plan, 'top')}`}>
                  <h2 className="font-display text-base font-semibold">{p.names[plan.id]}</h2>
                  <p className="num mt-0.5 text-sm font-semibold md:text-lg">{plan.price === 0 ? p.free : fmt(p.perMonth, { price: plan.price })}</p>
                  {isCurrent(plan) && (
                    <p className="mt-1 text-xs text-primary">
                      {p.current}
                      {profile?.plan_until && plan.id !== 'free' ? ` · ${fmt(p.until, { date: new Date(profile.plan_until).toLocaleDateString('ru-RU') })}` : ''}
                    </p>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
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
                    <td key={plan.id} className={`px-3 pt-1 pb-3 md:border-t md:border-t-border md:px-4 md:pt-3 ${col(plan)}`}>
                      {r.cell(plan)}
                    </td>
                  ))}
                </tr>
              </Fragment>
            ))}
            <tr>
              <td className="hidden px-4 pt-1 pb-4 md:table-cell" />
              {PLANS.map((plan) => (
                <td key={plan.id} className={`px-2 pt-1 pb-4 md:px-4 ${col(plan, 'bottom')}`}>
                  {!isCurrent(plan) && plan.price > 0 && (
                    <Button variant={plan.id === 'pro_plus' ? 'primary' : 'secondary'} className="w-full !px-2" onClick={() => setAsked(true)}>
                      {p.choose}
                    </Button>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </Card>
    </div>
  )
}
