/**
 * Тарифы: Basic (бесплатно), Pro, Pro Plus — карточки рядом (на телефоне — друг под другом).
 * Оплаты пока нет: тариф выдаёт админ. Текущий тариф подсвечен.
 */
import { useState } from 'react'
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

  const features = (plan: PlanInfo) => [
    plan.tradeLimit === null ? p.features.tradesUnlimited : fmt(p.features.trades, { n: plan.tradeLimit }),
    p.features.base,
    ...(plan.polymarket ? [p.features.polymarket] : []),
    ...(plan.exchanges ? [p.features.exchanges] : []),
    ...(plan.serverSync ? [p.features.serverSync] : []),
  ]

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">{p.title}</h1>
        <p className="mt-1 text-sm text-muted">{p.hint}</p>
      </div>
      {asked && <Alert tone="info">{p.contact}</Alert>}
      <div className="grid gap-3 md:grid-cols-3">
        {PLANS.map((plan, i) => {
          const current = usage?.plan === plan.id
          return (
            <Card
              key={plan.id}
              className={`rise flex flex-col gap-4 !p-5 ${current ? 'border-primary/60 shadow-glow' : ''}`}
              style={{ '--i': i } as React.CSSProperties}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-display text-lg font-semibold">{p.names[plan.id]}</h2>
                  <p className="num mt-1 text-2xl font-semibold">{plan.price === 0 ? p.free : fmt(p.perMonth, { price: plan.price })}</p>
                </div>
                {current && (
                  <span className="rounded-md bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                    {p.current}
                    {profile?.plan_until && plan.id !== 'free' ? ` · ${fmt(p.until, { date: new Date(profile.plan_until).toLocaleDateString('ru-RU') })}` : ''}
                  </span>
                )}
              </div>
              <ul className="flex flex-1 flex-col gap-2 text-sm">
                {features(plan).map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-accent" aria-hidden>
                      ✓
                    </span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              {!current && plan.price > 0 && (
                <Button variant={plan.id === 'pro_plus' ? 'primary' : 'secondary'} onClick={() => setAsked(true)}>
                  {p.choose}
                </Button>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
