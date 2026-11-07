/**
 * Тарифы на главной — три карточки рядом (на телефоне друг под другом).
 * Pro Plus выделен рамкой и плашкой «Всё включено». Страница /plans по-прежнему показывает таблицу (PlansTable).
 */
import type { ReactNode } from 'react'
import { fmt, useT } from '@/i18n'
import { PLANS, type PlanInfo } from '@/lib/plans'
import { Reveal } from './Reveal'

const CHECK = 'M4 10.5l3.5 3.5L16 5.5'
const DASH = 'M5 10h10'

function Mark({ on }: { on: boolean }) {
  return (
    <span
      className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${on ? 'bg-primary/15 text-primary' : 'bg-surface-2 text-muted'}`}
      aria-hidden
    >
      <svg viewBox="0 0 20 20" className="size-3" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        <path d={on ? CHECK : DASH} />
      </svg>
    </span>
  )
}

export function PlanCards({ action }: { action: (plan: PlanInfo) => ReactNode }) {
  const t = useT()
  const p = t.plans
  return (
    <div className="grid gap-4 md:grid-cols-3 md:items-stretch">
      {PLANS.map((plan, i) => {
        const best = plan.id === 'pro_plus'
        const items: [string, boolean][] = [
          [plan.tradeLimit === null ? p.tradesUnlimitedLine : fmt(p.tradesLine, { n: plan.tradeLimit }), true],
          [p.features.base, true],
          [p.features.polymarket, plan.polymarket],
          [p.features.exchanges, plan.exchanges],
          [p.features.serverSync, plan.serverSync],
        ]
        return (
          <Reveal key={plan.id} delay={i * 110} className="flex">
            <div
              className={`relative flex w-full flex-col rounded-2xl border bg-surface p-6 sm:p-7 ${
                best ? 'border-primary/70 ring-1 ring-primary/30' : 'card-lift border-border'
              }`}
            >
            {best && (
              <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-on-primary">{p.best}</span>
            )}
            <h3 className="text-lg font-bold">{p.names[plan.id]}</h3>
            <p className="mt-4 flex items-baseline gap-1.5">
              {plan.price === 0 ? (
                <span className="text-4xl font-bold tracking-tight">{p.free}</span>
              ) : (
                <>
                  <span className="num text-4xl font-bold tracking-tight">${plan.price}</span>
                  <span className="text-muted">{p.month}</span>
                </>
              )}
            </p>
            <ul className="mt-6 flex flex-1 flex-col gap-3 border-t border-border pt-6 text-sm leading-relaxed">
              {items.map(([label, on]) => (
                <li key={label} className={`flex gap-3 ${on ? '' : 'text-muted'}`}>
                  <Mark on={on} />
                  <span>{label}</span>
                </li>
              ))}
            </ul>
            <div className="mt-7">{action(plan)}</div>
            </div>
          </Reveal>
        )
      })}
    </div>
  )
}
