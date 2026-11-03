import { useT } from '@/i18n'
import type { CustomRange, PeriodPreset } from '@/lib/period'
import { controlClass } from '@/components/ui/Field'

type Props = {
  preset: PeriodPreset
  custom: CustomRange
  onPreset: (p: PeriodPreset) => void
  onCustom: (c: CustomRange) => void
}

export function PeriodFilter({ preset, custom, onPreset, onCustom }: Props) {
  const t = useT()
  const presets: PeriodPreset[] = ['week', 'month', 'all', 'custom']
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex max-w-full overflow-x-auto rounded-lg border border-border bg-surface p-1" role="radiogroup" aria-label={t.period.label}>
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={preset === p}
            onClick={() => onPreset(p)}
            className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm transition-colors sm:px-3 ${preset === p ? 'bg-surface-2 text-text' : 'text-muted hover:text-text'}`}
          >
            {t.period[p]}
          </button>
        ))}
      </div>
      {preset === 'custom' && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <span>{t.period.from}</span>
          <input type="date" aria-label={t.period.from} value={custom.from} onChange={(e) => onCustom({ ...custom, from: e.target.value })} className={`${controlClass} w-auto py-1.5`} />
          <span>{t.period.to}</span>
          <input type="date" aria-label={t.period.to} value={custom.to} onChange={(e) => onCustom({ ...custom, to: e.target.value })} className={`${controlClass} w-auto py-1.5`} />
        </div>
      )}
    </div>
  )
}
