import { useId, type InputHTMLAttributes } from 'react'

type Props = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }

export function Input({ label, error, className = '', ...rest }: Props) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm text-muted">
        {label}
      </label>
      <input
        id={id}
        {...rest}
        aria-invalid={Boolean(error)}
        className={`rounded-lg border bg-surface-2 px-3 py-2.5 text-base text-text outline-none transition-colors placeholder:text-muted/60 focus:border-primary sm:text-sm ${error ? 'border-loss' : 'border-border'} ${className}`}
      />
      {error && <p className="text-xs text-loss">{error}</p>}
    </div>
  )
}
