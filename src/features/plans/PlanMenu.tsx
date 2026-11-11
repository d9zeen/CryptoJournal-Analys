/**
 * Тариф в панели: пилюля с названием («Pro Plus») у логотипа. По нажатию открывается окошко: текущий тариф со сроком
 * и лимитом сделок, три тарифа на выбор (текущий отмечен, остальные ведут на страницу тарифов — оплаты на сайте пока нет),
 * внизу ссылка «Сравнить тарифы». Закрывается по Esc, по клику мимо и при переходе на другую страницу.
 * align — с какой стороны пилюли раскрывать: left (левая панель) или right (шапка планшета).
 */
import { useEffect, useId, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { fmt, plural, useT } from '@/i18n'
import { useProfile, useUsage } from '@/features/settings/api'
import { PLANS, monthlyPrice, planTerm } from '@/lib/plans'
import { formatDateShort } from '@/lib/format'
import type { Plan } from '@/types/db'

export function PlanMenu({ align = 'left' }: { align?: 'left' | 'right' }) {
  const t = useT()
  const p = t.plans
  const { data: usage } = useUsage()
  const { data: profile } = useProfile()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const id = useId()
  const { pathname } = useLocation()

  // переход на другую страницу — окошко закрывается
  useEffect(() => setOpen(false), [pathname])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!usage) return null
  const current: Plan = usage.plan
  const paid = current !== 'free'
  const term = planTerm(profile, current)
  const termText = term
    ? term.kind === 'trial'
      ? fmt(p.term.trial, { days: plural(term.daysLeft, p.daysN) })
      : fmt(p.term.until, { plan: p.names[term.plan], date: formatDateShort(term.until) })
    : null
  const limit = usage.trade_limit
  const share = limit ? Math.min(1, usage.trades_created / limit) : 0
  const summary: Record<Plan, string> = {
    free: fmt(p.picker.summaryFree, { trades: PLANS[0].tradeLimit ?? 0, shots: PLANS[0].screenshots }),
    pro: fmt(p.picker.summaryPro, { conn: PLANS[1].connections, shots: PLANS[1].screenshots }),
    pro_plus: fmt(p.picker.summaryProPlus, { conn: PLANS[2].connections }),
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${p.picker.label}: ${p.names[current]}`}
        title={termText ?? undefined}
        onClick={() => setOpen((v) => !v)}
        className={`rounded-lg px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition-colors ${
          paid ? 'bg-primary/15 text-primary hover:bg-primary/25' : 'bg-surface-2 text-muted hover:text-text'
        } ${open ? 'ring-2 ring-primary/40' : ''}`}
      >
        {p.names[current]}
      </button>

      {open && (
        <div
          id={id}
          role="dialog"
          aria-label={p.picker.label}
          className={`rise absolute top-full z-30 mt-2 w-72 rounded-xl border border-border bg-surface p-2 shadow-xl ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {/* текущий тариф: срок и лимит сделок */}
          <div className="px-2.5 pt-1.5 pb-2.5">
            <div className="text-xs text-muted">{p.current}</div>
            <div className="mt-0.5 font-semibold text-text">{p.names[current]}</div>
            {termText && (
              <div data-plan-term className="mt-0.5 text-xs text-muted">
                {termText}
              </div>
            )}
            <div className="num mt-1.5 text-xs text-muted">
              {limit ? fmt(t.settings.usageFree, { used: usage.trades_created, limit }) : fmt(t.settings.usagePro, { used: usage.trades_created })}
            </div>
            {limit && (
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-2">
                <i className={`block h-full rounded-full ${share >= 0.9 ? 'bg-loss' : 'bg-primary'}`} style={{ width: `${share * 100}%` }} />
              </div>
            )}
          </div>

          {/* три тарифа: текущий отмечен, остальные — на страницу тарифов */}
          <ul className="flex flex-col gap-0.5 border-t border-border pt-2" aria-label={p.picker.choose}>
            {PLANS.map((plan) => {
              const isCurrent = plan.id === current
              const price = plan.price === 0 ? p.free : `$${monthlyPrice(plan, 'month')} ${p.month}`
              const body = (
                <>
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`text-sm font-semibold whitespace-nowrap ${isCurrent ? 'text-primary' : 'text-text'}`}>{p.names[plan.id]}</span>
                    <span className="num text-xs text-muted">{isCurrent ? price : `${price} · ${p.picker.choose}`}</span>
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">{summary[plan.id]}</span>
                </>
              )
              return (
                <li key={plan.id}>
                  {isCurrent ? (
                    <div aria-current="true" className="relative rounded-lg bg-primary/10 py-2 pr-3 pl-4">
                      <span className="absolute top-2.5 bottom-2.5 left-1.5 w-[3px] rounded-full bg-primary" aria-hidden />
                      {body}
                    </div>
                  ) : (
                    <Link
                      to="/plans"
                      viewTransition
                      className="block rounded-lg py-2 pr-3 pl-4 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                    >
                      {body}
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>

          <div className="mt-2 border-t border-border px-2.5 pt-2.5 pb-1">
            <Link to="/plans" viewTransition className="text-xs font-medium text-primary hover:underline">
              {p.compare} →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
