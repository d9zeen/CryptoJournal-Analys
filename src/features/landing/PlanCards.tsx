/**
 * Тарифы на главной — три карточки рядом (на телефоне друг под другом), над ними переключатель «Месяц / Год».
 * Образец — Prism UI «Pricing» (21st.dev), переделан под сайт: вперёд выходит карточка под мышкой (или в фокусе с клавиатуры),
 * остальные отходят назад и разворачиваются к ней (.plan-card[data-pos] в theme.css). Пока мышки нет — впереди Pro Plus.
 * Pro Plus (главный) — значок в углу; у карточки впереди — фиолетовая рамка и главная кнопка. Страница /plans — таблица (PlansTable).
 */
import { useRef, useState, type ReactNode } from 'react'
import { useSpotlight } from '@/lib/motion'
import { fmt, plural, useT } from '@/i18n'
import { MAIN_PLAN, PLANS, type Billing, type PlanInfo } from '@/lib/plans'
import { BillingToggle } from '@/features/plans/BillingToggle'
import { PlanPrice } from '@/features/plans/PlanPrice'
import { Reveal } from './Reveal'

const CHECK = 'M4 10.5l3.5 3.5L16 5.5'
const DASH = 'M5 10h10'
const STAR = 'M10 2.5l2.3 4.7 5.2.8-3.8 3.6.9 5.1L10 14.3l-4.6 2.4.9-5.1L2.5 8l5.2-.8L10 2.5z'
const MAIN_INDEX = PLANS.findIndex((x) => x.id === MAIN_PLAN)

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

/** action(plan, front) — кнопка внизу карточки; front = карточка сейчас впереди (у неё кнопка главная) */
export function PlanCards({ action }: { action: (plan: PlanInfo, front: boolean) => ReactNode }) {
  const t = useT()
  const p = t.plans
  const [billing, setBilling] = useState<Billing>('month')
  const [hover, setHover] = useState<number | null>(null)
  const spotRef = useRef<HTMLDivElement>(null)
  useSpotlight(spotRef)
  const front = hover ?? MAIN_INDEX
  return (
    <div className="flex flex-col gap-6">
      <div className="self-start">
        <BillingToggle value={billing} onChange={setBilling} />
      </div>
      <div
        ref={spotRef}
        className="plan-stage grid gap-4 md:grid-cols-3 md:items-stretch md:pt-6"
        onPointerLeave={() => setHover(null)}
        onBlur={(e) => {
          // фокус ушёл из блока тарифов (Tab дальше) — впереди снова Pro Plus
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHover(null)
        }}
      >
        {PLANS.map((plan, i) => {
          const main = plan.id === MAIN_PLAN
          const pos = i === front ? 'active' : i < front ? 'before' : 'after'
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
                data-pos={pos}
                data-plan={plan.id}
                onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(i)}
                onFocus={() => setHover(i)}
                className="plan-card flex w-full"
              >
                <div
                  data-spot
                  className={`spot-frame relative flex w-full rounded-2xl transition-shadow duration-300 ${
                    pos === 'active' ? '[--spot-rest:var(--color-primary)] ring-1 ring-primary' : main ? '[--spot-rest:color-mix(in_srgb,var(--color-primary)_45%,var(--color-border))]' : ''
                  }`}
                >
                  <div className="spot-card relative flex w-full flex-col overflow-hidden rounded-[calc(1rem-1px)] bg-surface p-6 sm:p-7">
                    {main && (
                      <span className="absolute top-0 right-0 flex items-center gap-1 rounded-bl-xl bg-primary px-2.5 py-1 text-xs font-semibold text-on-primary">
                        <svg viewBox="0 0 20 20" className="size-3.5" fill="currentColor" aria-hidden>
                          <path d={STAR} />
                        </svg>
                        {p.best}
                      </span>
                    )}
                    <div className="text-center">
                      <h3 className="text-sm font-semibold tracking-wider text-muted uppercase">{p.names[plan.id]}</h3>
                      <div className="mt-4 flex min-h-16 justify-center">
                        <PlanPrice plan={plan} billing={billing} size="lg" center />
                      </div>
                    </div>
                    <ul className="mt-6 flex flex-1 flex-col gap-3 border-t border-border pt-6 text-sm leading-relaxed">
                      {items.map(([label, on]) => (
                        <li key={label} className={`flex gap-3 ${on ? '' : 'text-muted'}`}>
                          <Mark on={on} />
                          <span>{label}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-7">{action(plan, pos === 'active')}</div>
                  </div>
                </div>
              </div>
            </Reveal>
          )
        })}
      </div>
      <p className="text-sm text-muted">{p.founder}</p>
    </div>
  )
}
