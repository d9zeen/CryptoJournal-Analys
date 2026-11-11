/**
 * Тарифы на главной — три карточки рядом (на телефоне друг под другом), над ними переключатель «Месяц / Год».
 * Pro Plus (главный) выделен рамкой и плашкой «Всё автоматически». Страница /plans показывает таблицу (PlansTable).
 */
import { useState, type ReactNode } from 'react'
import { fmt, plural, useT } from '@/i18n'
import { MAIN_PLAN, PLANS, type Billing, type PlanInfo } from '@/lib/plans'
import { BillingToggle } from '@/features/plans/BillingToggle'
import { PlanPrice } from '@/features/plans/PlanPrice'
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
  const [billing, setBilling] = useState<Billing>('month')
  return (
    <div className="flex flex-col gap-6">
      <BillingToggle value={billing} onChange={setBilling} />
      <div className="grid gap-4 md:grid-cols-3 md:items-stretch">
        {PLANS.map((plan, i) => {
          const best = plan.id === MAIN_PLAN
          const items: [string, boolean][] = [
            [plan.tradeLimit === null ? p.tradesUnlimitedLine : fmt(p.tradesLine, { n: plan.tradeLimit }), true],
            [p.features.base, true],
            [plan.connections ? plural(plan.connections, p.connectionsLine) : p.connectionsNone, plan.connections > 0],
            [p.features.polymarket, plan.polymarket],
            [plan.serverSync ? p.syncServerLine : p.syncOpenLine, plan.connections > 0],
            [plural(plan.screenshots, p.screenshotsLine), true],
            [plan.allPalettes ? p.palettesAllLine : p.palettesFreeLine, true],
            [p.features.early, plan.earlyAccess],
          ]
          return (
            <Reveal key={plan.id} delay={i * 110} className="flex">
              <div
                className={`relative flex w-full flex-col rounded-2xl border bg-surface p-6 sm:p-7 ${
                  best ? 'border-primary/70 ring-1 ring-primary/30' : 'card-lift border-border'
                }`}
              >
                {best && <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-on-primary">{p.best}</span>}
                <h3 className="text-lg font-bold">{p.names[plan.id]}</h3>
                <div className="mt-4 min-h-14">
                  <PlanPrice plan={plan} billing={billing} size="lg" />
                </div>
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
      <p className="text-sm text-muted">{p.founder}</p>
    </div>
  )
}
