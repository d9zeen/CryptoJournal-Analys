import { fmt, useT } from '@/i18n'
import { monthlyPrice, type Billing, type PlanInfo } from '@/lib/plans'
import { RollNumber } from '@/components/RollNumber'

/**
 * Цена тарифа: «$15 / мес»; за год — цена в пересчёте на месяц («$12 / мес») и под ней «$144 в год».
 * При переключении «Месяц / Год» цифра прокручивается (RollNumber), а не прыгает. center — по центру (карточки на главной).
 */
export function PlanPrice({ plan, billing, size = 'md', center = false }: { plan: PlanInfo; billing: Billing; size?: 'md' | 'lg'; center?: boolean }) {
  const p = useT().plans
  const big = size === 'lg' ? 'text-4xl font-bold tracking-tight' : 'text-sm font-semibold md:text-lg'
  if (plan.price === 0) return <p className={big}>{p.free}</p>
  const year = billing === 'year' && plan.priceYear !== null
  return (
    <div className={center ? 'text-center' : ''}>
      <p className={`flex items-baseline gap-1.5 ${center ? 'justify-center' : ''}`}>
        <RollNumber text={`$${monthlyPrice(plan, billing)}`} token={billing} className={`num ${big}`} />
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
