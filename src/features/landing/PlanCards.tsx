/**
 * Тарифы на главной — как Prism UI «Pricing» (21st.dev): по центру тумблер «Оплата за год (−20 %)», под ним три карточки.
 * Карточка: название, крупная цена, «оплата помесячно / за год», только то, что входит (галочки), черта, кнопка, описание.
 * Правка владельца: «главная» карточка — та, что под мышкой (или в фокусе с клавиатуры), без мышки — Pro Plus.
 * Главная поднята на 20px, рамка 2px цвета кнопок, кнопка залита; остальные 94 % и придвинуты к ней (.plan-card[data-pos] в theme.css).
 * Значок «★ Всё автоматически» — всегда у Pro Plus, как «Popular» в образце. Страница /plans — таблица (PlansTable).
 */
import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { useSpotlight } from '@/lib/motion'
import { fmt, plural, useT } from '@/i18n'
import { MAIN_PLAN, PLANS, monthlyPrice, yearDiscount, type Billing, type PlanInfo } from '@/lib/plans'
import { RollNumber } from '@/components/RollNumber'
import { Reveal } from './Reveal'

const CHECK = 'M4 10.5l3.5 3.5L16 5.5'
const STAR = 'M10 2.5l2.3 4.7 5.2.8-3.8 3.6.9 5.1L10 14.3l-4.6 2.4.9-5.1L2.5 8l5.2-.8L10 2.5z'
const MAIN_INDEX = PLANS.findIndex((x) => x.id === MAIN_PLAN)

/** Что входит в тариф — только включённое, как в образце */
function useFeatures(plan: PlanInfo): string[] {
  const p = useT().plans
  return [
    plan.tradeLimit === null ? p.tradesUnlimitedLine : fmt(p.tradesLine, { n: plan.tradeLimit }),
    p.features.base,
    plan.connections ? plural(plan.connections, p.connectionsLine) : null,
    plan.polymarket ? p.features.polymarket : null,
    plan.connections ? (plan.serverSync ? p.syncServerLine : p.syncOpenLine) : null,
    plural(plan.screenshots, p.screenshotsLine),
    plan.allPalettes ? p.palettesAllLine : p.palettesFreeLine,
    plan.earlyAccess ? p.features.early : null,
  ].filter((x): x is string => x !== null)
}

/** Тумблер «Оплата за год (экономия 20 %)» — как Switch в образце */
function AnnualSwitch({ billing, onChange }: { billing: Billing; onChange: (b: Billing) => void }) {
  const c = useT().plans.cards
  const on = billing === 'year'
  const discount = Math.max(...PLANS.map(yearDiscount))
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(on ? 'month' : 'year')} className="group inline-flex items-center gap-3">
      <span
        aria-hidden
        className={`relative h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-primary ${on ? 'bg-primary' : 'bg-border'}`}
      >
        <span className={`absolute top-0 left-0 size-5 rounded-full bg-surface transition-transform duration-200 ${on ? 'translate-x-5' : ''}`} />
      </span>
      <span className="font-semibold">
        {c.annual} {discount > 0 && <span className="text-primary">{fmt(c.save, { n: discount })}</span>}
      </span>
    </button>
  )
}

export function PlanCards({ to, label }: { to: string; label: string }) {
  const [billing, setBilling] = useState<Billing>('month')
  const [hover, setHover] = useState<number | null>(null)
  const spotRef = useRef<HTMLDivElement>(null)
  useSpotlight(spotRef)
  const t = useT()
  const front = hover ?? MAIN_INDEX
  return (
    <div className="flex flex-col items-center">
      <div className="mb-10">
        <AnnualSwitch billing={billing} onChange={setBilling} />
      </div>
      <div
        ref={spotRef}
        className="grid w-full max-w-[1180px] grid-cols-1 gap-4 md:grid-cols-3 md:items-stretch md:pt-5"
        onPointerLeave={() => setHover(null)}
        onBlur={(e) => {
          // фокус ушёл из блока тарифов (Tab дальше) — впереди снова Pro Plus
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHover(null)
        }}
      >
        {PLANS.map((plan, i) => (
          <Reveal key={plan.id} delay={i * 110} className="flex">
            <Card
              plan={plan}
              billing={billing}
              pos={i === front ? 'active' : i < front ? 'before' : 'after'}
              onEnter={() => setHover(i)}
              to={to}
              label={label}
            />
          </Reveal>
        ))}
      </div>
      <p className="mt-8 text-center text-sm text-muted">{t.plans.founder}</p>
    </div>
  )
}

function Card({
  plan,
  billing,
  pos,
  onEnter,
  to,
  label,
}: {
  plan: PlanInfo
  billing: Billing
  pos: 'active' | 'before' | 'after'
  onEnter: () => void
  to: string
  label: string
}) {
  const t = useT()
  const p = t.plans
  const c = p.cards
  const features = useFeatures(plan)
  const main = plan.id === MAIN_PLAN
  const active = pos === 'active'
  const paid = plan.price > 0
  const year = billing === 'year' && plan.priceYear !== null
  return (
    <div
      data-pos={pos}
      data-plan={plan.id}
      onPointerEnter={(e) => e.pointerType === 'mouse' && onEnter()}
      onFocus={onEnter}
      className="plan-card flex w-full"
    >
      {/* рамка: обёртка .spot-frame (подсветка под курсором); у карточки впереди — 2px цвета кнопок, как у Popular в образце */}
      <div
        data-spot
        className={`spot-frame flex w-full rounded-2xl ${active ? '[--spot-rest:var(--color-primary)]' : ''}`}
        // 2px — инлайном: класс .spot-frame в theme.css задаёт padding 1px и перебивает утилиту
        style={active ? { padding: 2 } : undefined}
      >
        <div className="spot-card relative flex w-full flex-col overflow-hidden rounded-[calc(1rem-2px)] bg-surface p-6 text-center">
          {main && (
            <span className="absolute top-0 right-0 flex items-center gap-1 rounded-bl-xl bg-primary px-2 py-0.5 text-sm font-semibold text-on-primary">
              <svg viewBox="0 0 20 20" className="size-4" fill="currentColor" aria-hidden>
                <path d={STAR} />
              </svg>
              {p.best}
            </span>
          )}
          <p className="text-base font-semibold text-muted uppercase">{p.names[plan.id]}</p>
          <div className="mt-6 flex items-center justify-center gap-x-2">
            {paid ? (
              <>
                <RollNumber text={`$${monthlyPrice(plan, billing)}`} token={billing} className="num text-5xl font-bold tracking-tight" />
                <span className="text-sm leading-6 font-semibold tracking-wide text-muted">{p.month}</span>
              </>
            ) : (
              <span className="text-5xl font-bold tracking-tight">{p.free}</span>
            )}
          </div>
          <p className="num mt-1 text-xs leading-5 text-muted">
            {!paid ? c.forever : year ? fmt(c.billedYearly, { price: plan.priceYear! }) : c.billedMonthly}
          </p>
          {/* как в образце: кнопка сразу под списком, свободное место — внизу карточки */}
          <ul className="mt-5 flex flex-col gap-2">
            {features.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <svg viewBox="0 0 20 20" className="mt-1 size-4 shrink-0 text-primary" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={CHECK} />
                </svg>
                <span className="text-left">{f}</span>
              </li>
            ))}
          </ul>
          <hr className="my-4 w-full border-border" />
          {/* кнопка как в образце: контур, при наведении заливается; у карточки впереди — сразу залита */}
          <Link
            to={to}
            className={`inline-flex w-full items-center justify-center rounded-lg border px-4 py-2.5 text-lg font-semibold tracking-tight transition-all duration-300 ease-out hover:bg-primary hover:text-on-primary hover:ring-2 hover:ring-primary hover:ring-offset-1 hover:ring-offset-surface focus-visible:outline-2 focus-visible:outline-primary ${
              active ? 'border-primary bg-primary text-on-primary' : 'border-border bg-surface text-text'
            }`}
          >
            {label}
          </Link>
          <p className="mt-6 text-xs leading-5 text-muted">{c.desc[plan.id]}</p>
        </div>
      </div>
    </div>
  )
}
