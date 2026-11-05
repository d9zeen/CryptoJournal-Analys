import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

export const controlClass =
  'w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-base text-text outline-none transition-[border-color,box-shadow] placeholder:text-muted/60 focus:border-primary focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-primary)_22%,transparent)] disabled:opacity-60 sm:text-sm'

type WrapProps = { label?: string; hint?: ReactNode; error?: string; children: (id: string) => ReactNode; className?: string }

/** Обёртка: подпись + поле + подсказка/ошибка */
export function FieldWrap({ label, hint, error, children, className = '' }: WrapProps) {
  const id = useId()
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label htmlFor={id} className="text-sm text-muted">
          {label}
        </label>
      )}
      {children(id)}
      {error ? <p className="text-xs text-loss">{error}</p> : hint ? <div className="text-xs text-muted">{hint}</div> : null}
    </div>
  )
}

type TextProps = InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: ReactNode; error?: string; wrapClassName?: string }

export function TextField({ label, hint, error, wrapClassName, className = '', ...rest }: TextProps) {
  return (
    <FieldWrap label={label} hint={hint} error={error} className={wrapClassName}>
      {(id) => <input id={id} {...rest} aria-invalid={Boolean(error)} className={`${controlClass} ${error ? 'border-loss' : ''} ${className}`} />}
    </FieldWrap>
  )
}

/** Поле для чисел: принимает и запятую, и точку */
export function NumberField(props: Omit<TextProps, 'type'>) {
  return <TextField type="text" inputMode="decimal" autoComplete="off" {...props} />
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label?: string; hint?: ReactNode; error?: string; wrapClassName?: string }

export function SelectField({ label, hint, error, wrapClassName, className = '', children, ...rest }: SelectProps) {
  return (
    <FieldWrap label={label} hint={hint} error={error} className={wrapClassName}>
      {(id) => (
        <select id={id} {...rest} className={`${controlClass} ${className}`}>
          {children}
        </select>
      )}
    </FieldWrap>
  )
}

type AreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; hint?: ReactNode; wrapClassName?: string }

export function TextArea({ label, hint, wrapClassName, className = '', ...rest }: AreaProps) {
  return (
    <FieldWrap label={label} hint={hint} className={wrapClassName}>
      {(id) => <textarea id={id} rows={4} {...rest} className={`${controlClass} resize-y ${className}`} />}
    </FieldWrap>
  )
}
