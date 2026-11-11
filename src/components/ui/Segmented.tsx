type Option<T extends string> = { value: T; label: string }

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
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(o.value)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${active ? 'bg-surface text-text' : 'text-muted hover:text-text'}`}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
