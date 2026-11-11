import { fmt, useT } from '@/i18n'
import { monthlyPrice, type Billing, type PlanInfo } from '@/lib/plans'

/** Цена тарифа: «$15 / мес»; за год — цена в пересчёте на месяц («$12 / мес») и под ней «$144 в год» */
export function PlanPrice({ plan, billing, size = 'md' }: { plan: PlanInfo; billing: Billing; size?: 'md' | 'lg' }) {
  const p = useT().plans
  const big = size === 'lg' ? 'text-4xl font-bold tracking-tight' : 'text-sm font-semibold md:text-lg'
  if (plan.price === 0) return <p className={big}>{p.free}</p>
  const year = billing === 'year' && plan.priceYear !== null
  return (
    <div>
      <p className="flex items-baseline gap-1.5">
        <span className={`num ${big}`}>${monthlyPrice(plan, billing)}</span>
        <span className="text-sm text-muted">{p.month}</span>
      </p>
      {year && (
        <p className="num mt-0.5 text-xs text-muted">
          {fmt(p.perYear, { price: plan.priceYear! })} · {p.perYearHint}
        </p>
      )}
    </div>
  )
}
