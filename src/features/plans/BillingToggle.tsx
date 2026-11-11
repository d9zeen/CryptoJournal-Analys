import { fmt, useT } from '@/i18n'
import { PLANS, yearDiscount, type Billing } from '@/lib/plans'

/** Переключатель «Месяц / Год»; у года — подпись со скидкой («−20 %») */
export function BillingToggle({ value, onChange }: { value: Billing; onChange: (b: Billing) => void }) {
  const p = useT().plans
  const discount = Math.max(...PLANS.map(yearDiscount))
  const opt = (b: Billing, label: string, extra?: string) => {
    const active = b === value
    return (
      <button
        type="button"
        role="radio"
        aria-checked={active}
        onClick={() => onChange(b)}
        className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${active ? 'bg-surface text-text' : 'text-muted hover:text-text'}`}
      >
        {label}
        {extra && <span className="num rounded bg-primary/15 px-1.5 py-0.5 text-xs font-semibold text-primary">{extra}</span>}
      </button>
    )
  }
  return (
    <div role="radiogroup" aria-label={p.billing.label} className="inline-flex rounded-lg border border-border bg-surface-2 p-1">
      {opt('month', p.billing.month)}
      {opt('year', p.billing.year, discount > 0 ? fmt(p.billing.discount, { n: discount }) : undefined)}
    </div>
  )
}
