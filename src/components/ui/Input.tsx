import { useId, type InputHTMLAttributes } from 'react'

/** invalid — подсветить поле цветом ошибки без текста под ним (текст — в общей ошибке формы) */
type Props = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; invalid?: boolean }

export function Input({ label, error, invalid, className = '', ...rest }: Props) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm text-muted">
        {label}
      </label>
      <input
        id={id}
        {...rest}
        aria-invalid={Boolean(error) || invalid || undefined}
        className={`rounded-lg border bg-surface-2 px-3 py-2.5 text-base text-text outline-none transition-[border-color,box-shadow] placeholder:text-muted/60 focus:border-primary focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-primary)_20%,transparent)] sm:text-sm ${error || invalid ? 'border-loss' : 'border-border'} ${className}`}
      />
      {error && <p className="text-xs text-loss">{error}</p>}
    </div>
  )
}
