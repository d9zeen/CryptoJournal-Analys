import type { ButtonHTMLAttributes } from 'react'
import { useT } from '@/i18n'
import { CheckMark } from '@/components/CheckMark'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerOutline'

const styles: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  secondary: 'bg-surface-2 text-text border border-border hover:border-muted',
  ghost: 'text-muted hover:text-text hover:bg-surface-2',
  danger: 'bg-loss text-on-primary hover:opacity-90',
  /** опасное действие, ещё не подтверждённое («Удалить аккаунт…»): красный контур, фон прозрачный */
  dangerOutline: 'border border-down bg-transparent text-down hover:bg-down/10',
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  /** идёт отправка: вместо надписи — крутилка, ширина кнопки не меняется (№4) */
  loading?: boolean
  /** успех: на ~400 мс рисуется галочка (вход, регистрация) */
  done?: boolean
}

export function Button({ variant = 'primary', loading, done, disabled, className = '', children, ...rest }: Props) {
  const t = useT()
  const busy = loading || done
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      aria-busy={loading || undefined}
      className={`relative inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-[background-color,border-color,color,box-shadow,transform] active:scale-[0.98] disabled:cursor-not-allowed ${busy ? '' : 'disabled:opacity-60'} ${styles[variant]} ${className}`}
    >
      {/* надпись остаётся в разметке (прозрачной) — ширина кнопки не прыгает */}
      <span className={`inline-flex items-center justify-center gap-2 transition-opacity duration-200 ${busy ? 'opacity-0' : ''}`}>{children}</span>
      {loading && (
        <span className="absolute inset-0 grid place-items-center">
          <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        </span>
      )}
      {done && !loading && (
        <span className="absolute inset-0 grid place-items-center">
          <CheckMark />
          <span className="sr-only">{t.common.done}</span>
        </span>
      )}
    </button>
  )
}
