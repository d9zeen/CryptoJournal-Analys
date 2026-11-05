import { useCallback, useRef, useState } from 'react'
import { useT } from '@/i18n'
import type { CustomRange, PeriodPreset } from '@/lib/period'
import { DateRangePicker, formatRange } from './DateRangePicker'

type Props = {
  preset: PeriodPreset
  custom: CustomRange
  onPreset: (p: PeriodPreset) => void
  onCustom: (c: CustomRange) => void
}

/**
 * Период: Неделя / Месяц / Всё время / Свой диапазон.
 * «Свой диапазон» открывает календарь; период меняется только после «Применить».
 * На кнопке — выбранные даты («1 окт. — 15 окт.»).
 */
export function PeriodFilter({ preset, custom, onPreset, onCustom }: Props) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  const presets: PeriodPreset[] = ['week', 'month', 'all']
  const hasCustom = preset === 'custom' && !!custom.from
  const customLabel = hasCustom ? formatRange(custom) : t.period.custom

  const item = (active: boolean) =>
    `flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm transition-colors sm:px-3 ${active ? 'bg-surface-2 text-text' : 'text-muted hover:text-text'}`

  return (
    <div ref={box} className="relative max-w-full">
      <div className="flex max-w-full overflow-x-auto rounded-lg border border-border bg-surface p-1" role="radiogroup" aria-label={t.period.label}>
        {presets.map((p) => (
          <button key={p} type="button" role="radio" aria-checked={preset === p} onClick={() => onPreset(p)} className={item(preset === p)}>
            {t.period[p]}
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={preset === 'custom'}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen((o) => !o)}
          className={item(preset === 'custom' || open)}
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z" />
          </svg>
          {customLabel}
        </button>
      </div>
      {open && (
        <DateRangePicker
          value={custom}
          anchor={box}
          onClose={close}
          onApply={(r) => {
            onCustom(r)
            onPreset('custom')
            setOpen(false)
          }}
        />
      )}
    </div>
  )
}
