type Option<T extends string> = { value: T; label: string; tone?: 'profit' | 'loss' }

type Props<T extends string> = {
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
  label?: string
  disabled?: boolean
}

/** Переключатель из нескольких кнопок (long/short, тип рынка…) */
export function Segmented<T extends string>({ value, options, onChange, label, disabled }: Props<T>) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <span className="text-sm text-muted">{label}</span>}
      <div role="radiogroup" aria-label={label} className="flex rounded-lg border border-border bg-surface-2 p-1">
        {options.map((o) => {
          const active = o.value === value
          const tone = o.tone === 'profit' ? 'bg-profit/15 text-profit' : o.tone === 'loss' ? 'bg-loss/15 text-loss' : 'bg-surface text-text'
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(o.value)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${active ? tone : 'text-muted hover:text-text'}`}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
