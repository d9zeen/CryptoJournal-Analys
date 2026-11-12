import { useT } from '@/i18n'
import type { PlanInfo } from '@/lib/plans'

/**
 * Цена тарифа за месяц: «$15 / мес». Оплаты за год пока нет — годовые цены (lib/plans.ts) вернутся вместе с оплатой.
 * center — по центру.
 */
export function PlanPrice({ plan, size = 'md', center = false }: { plan: PlanInfo; size?: 'md' | 'lg'; center?: boolean }) {
  const p = useT().plans
  const big = size === 'lg' ? 'text-4xl font-bold tracking-tight' : 'text-sm font-semibold md:text-lg'
  if (plan.price === 0) return <p className={big}>{p.free}</p>
  return (
    <p className={`flex items-baseline gap-1.5 ${center ? 'justify-center' : ''}`}>
      <span className={`num ${big}`}>${plan.price}</span>
      <span className="text-sm text-muted">{p.month}</span>
    </p>
  )
}
