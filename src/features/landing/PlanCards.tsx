/**
 * Тарифы на главной — как Prism UI «Pricing» (21st.dev): три карточки. Тумблера «за год» нет: оплаты за год пока нет (решение владельца 11.11.2026).
 * Карточка: название, крупная цена в месяц, описание (text-sm), список возможностей, черта, кнопка у самого низа.
 * Список во всех трёх карточках один и тот же, в одном порядке (как у Pro Plus): включённое — галочкой цвета кнопок,
 * то, чего в тарифе нет, — бледным, с ✕ и зачёркнутым (для экранных чтецов — «не входит»); строки, где тарифы отличаются числом, — значением.
 * Все три карточки одной высоты при любом положении «активной» (grid items-stretch → Reveal flex → карточка h-full).
 * Правка владельца: «главная» карточка — та, что под мышкой (или в фокусе с клавиатуры), без мышки — Pro Plus.
 * Главная поднята на 20px, рамка 2px цвета кнопок, кнопка залита; остальные 94 % и придвинуты к ней (.plan-card[data-pos] в theme.css).
 * Значок «★ Всё автоматически» — всегда у Pro Plus, как «Popular» в образце. Страница /plans — таблица (PlansTable).
 */
import { useEffect, useRef, useState, type RefObject } from 'react'
import { Link } from 'react-router'
import { useSpotlight } from '@/lib/motion'
import { fmt, plural, useT } from '@/i18n'
import { MAIN_PLAN, PLANS, type PlanInfo } from '@/lib/plans'
import { Reveal } from './Reveal'

const CHECK = 'M4 10.5l3.5 3.5L16 5.5'
const CROSS = 'M5.5 5.5l9 9m0-9l-9 9'
const STAR = 'M10 2.5l2.3 4.7 5.2.8-3.8 3.6.9 5.1L10 14.3l-4.6 2.4.9-5.1L2.5 8l5.2-.8L10 2.5z'
const MAIN_INDEX = PLANS.findIndex((x) => x.id === MAIN_PLAN)

/** Одни и те же строки у всех тарифов (порядок — как у Pro Plus): text — что написать, on — входит ли в тариф */
function useFeatures(plan: PlanInfo): { text: string; on: boolean }[] {
  const p = useT().plans
  return [
    { text: plan.tradeLimit === null ? p.tradesUnlimitedLine : fmt(p.tradesLine, { n: plan.tradeLimit }), on: true },
    { text: p.features.base, on: true },
    { text: plan.connections ? plural(plan.connections, p.connectionsLine) : p.cards.connectionsNone, on: plan.connections > 0 },
    { text: p.features.polymarket, on: plan.polymarket },
    { text: plan.connections ? (plan.serverSync ? p.syncServerLine : p.syncOpenLine) : p.cards.syncNone, on: plan.connections > 0 },
    { text: plural(plan.screenshots, p.screenshotsLine), on: true },
    { text: plan.allPalettes ? p.palettesAllLine : p.palettesFreeLine, on: true },
    { text: p.features.early, on: plan.earlyAccess },
  ]
}

/**
 * Строки списков друг напротив друга: строка с одним номером во всех трёх карточках одной высоты
 * (если в одной карточке текст переносится на 2 строки, у соседей под ним остаётся столько же места).
 * Только когда карточки стоят рядом (от 768px); пересчёт при изменении размера (ResizeObserver) и смене языка (новый DOM).
 */
function useAlignedRows(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = ref.current
    if (!root || typeof ResizeObserver === 'undefined') return
    let frame = 0
    const sync = () => {
      const lists = [...root.querySelectorAll<HTMLElement>('[data-plan] ul')]
      const rows = lists.map((ul) => [...ul.children] as HTMLElement[])
      rows.flat().forEach((li) => (li.style.minHeight = ''))
      if (!window.matchMedia('(min-width: 768px)').matches) return
      const n = Math.max(0, ...rows.map((r) => r.length))
      for (let i = 0; i < n; i++) {
        const h = Math.max(...rows.map((r) => r[i]?.offsetHeight ?? 0))
        rows.forEach((r) => r[i] && (r[i].style.minHeight = `${h}px`))
      }
    }
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(sync)
    })
    ro.observe(root)
    sync()
    return () => {
      ro.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [ref])
}

export function PlanCards({ to, label }: { to: string; label: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const spotRef = useRef<HTMLDivElement>(null)
  useSpotlight(spotRef)
  useAlignedRows(spotRef)
  const front = hover ?? MAIN_INDEX
  return (
    <div className="flex flex-col items-center">
      <div
        ref={spotRef}
        className="grid w-full max-w-[1180px] grid-cols-1 gap-4 md:grid-cols-3 md:items-stretch md:gap-6 md:pt-5"
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
              pos={i === front ? 'active' : i < front ? 'before' : 'after'}
              onEnter={() => setHover(i)}
              to={to}
              label={label}
            />
          </Reveal>
        ))}
      </div>
    </div>
  )
}

function Card({
  plan,
  pos,
  onEnter,
  to,
  label,
}: {
  plan: PlanInfo
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
        <div className="spot-card @container relative flex w-full flex-col overflow-hidden rounded-[calc(1rem-2px)] bg-surface p-6 text-center">
          {main && (
            <span className="absolute top-0 right-0 flex items-center gap-1 rounded-bl-xl bg-primary px-2 py-0.5 text-sm font-semibold text-on-primary">
              <svg viewBox="0 0 20 20" className="size-4" fill="currentColor" aria-hidden>
                <path d={STAR} />
              </svg>
              {p.best}
            </span>
          )}
          <p className="text-base font-semibold text-muted uppercase">{p.names[plan.id]}</p>
          {/* строка цены одной высоты у всех: «$10 / mo», у бесплатного — «Free / forever» на месте «/ mo» (не отдельной строкой);
              длинное слово («Бесплатно») — мельче и по ширине карточки (container query), чтобы строка не переносилась и не вылезала */}
          <div data-price className="mt-6 flex h-14 flex-wrap content-center items-center justify-center gap-x-2 whitespace-nowrap">
            {paid ? (
              <span className="num text-5xl leading-none font-bold tracking-tight">${plan.price}</span>
            ) : (
              <span
                className={`leading-none font-bold tracking-tight ${p.free.length > 6 ? 'text-2xl @[17rem]:text-3xl @[20rem]:text-4xl' : 'text-4xl @[16rem]:text-5xl'}`}
              >
                {p.free}
              </span>
            )}
            <span className="text-sm leading-6 font-semibold tracking-wide text-muted">{paid ? p.month : c.forever}</span>
          </div>
          {/* описание — сразу под ценой, когда карточки рядом — не меньше 2 строк (на планшете — 3): список во всех карточках начинается с одной высоты;
              список растягивается, кнопка прижата к низу — кнопки на одной линии */}
          <p className="mt-3 text-sm text-muted md:min-h-[3lh] lg:min-h-[2lh]">{c.desc[plan.id]}</p>
          <ul className="mt-5 flex flex-1 flex-col gap-2">
            {features.map((f, k) => (
              <li key={k} data-on={f.on} className={`flex items-start gap-2 ${f.on ? '' : 'text-muted opacity-50'}`}>
                <svg
                  viewBox="0 0 20 20"
                  className={`mt-1 size-4 shrink-0 ${f.on ? 'text-primary' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={f.on ? 2.4 : 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d={f.on ? CHECK : CROSS} />
                </svg>
                <span className={`text-left ${f.on ? '' : 'line-through'}`}>
                  {f.text}
                  {!f.on && <span className="sr-only"> — {c.notIncluded}</span>}
                </span>
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
        </div>
      </div>
    </div>
  )
}
