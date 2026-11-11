import { Link } from 'react-router'
import { fmt, plural, useT } from '@/i18n'
import { useProfile, useUsage } from '@/features/settings/api'
import { formatDateShort } from '@/lib/format'
import { planTerm } from '@/lib/plans'

/**
 * Мягкая плашка на дашборде, когда тариф скоро закончится:
 * пробный Pro Plus — за 2 дня («Тарифы»), оплаченный тариф — за 3 дня («Продлить»).
 */
export function PlanEndingBanner() {
  const t = useT()
  const p = t.plans
  const { data: usage } = useUsage()
  const { data: profile } = useProfile()
  const term = planTerm(profile, usage?.plan)
  if (!term?.soon) return null
  const text =
    term.kind === 'trial'
      ? fmt(p.term.trialEnds, { days: plural(term.daysLeft, p.daysN) })
      : fmt(p.term.paidEnds, { plan: p.names[term.plan], date: formatDateShort(term.until) })
  return (
    <div data-plan-ending className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-border bg-surface-2/60 px-4 py-3 text-sm">
      <span>{text}</span>
      <Link to="/plans" className="font-medium text-primary hover:underline">
        {term.kind === 'trial' ? p.title : p.term.renew}
      </Link>
    </div>
  )
}
