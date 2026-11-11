/**
 * Поле пароля (№5): глазик «показать / скрыть» (перечёркивание рисуется линией), на всех полях пароля.
 * meter — полоска надёжности из 4 частей и подсказка «чего не хватает»: только там, где пароль придумывают.
 * Полоска только подсказывает и НЕ запрещает отправку (минимум 6 символов, простые пароли разрешены — решение владельца 06.11.2026).
 */
import { useId, useState, type InputHTMLAttributes } from 'react'
import { fmt, useT } from '@/i18n'
import { passwordStrength } from '@/lib/password'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: string
  value: string
  /** подсветить поле цветом ошибки */
  invalid?: boolean
  hint?: string
  meter?: boolean
}

const LEVEL_BG = ['', 'bg-loss', 'bg-warning', 'bg-accent', 'bg-profit']
const LEVEL_TEXT = ['', 'text-loss', 'text-warning', 'text-accent', 'text-profit']

export const fieldClass = (invalid?: boolean) =>
  `w-full rounded-lg border bg-surface-2 px-3 py-2.5 text-base text-text outline-none transition-[border-color,box-shadow] placeholder:text-muted/60 focus:border-primary focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-primary)_20%,transparent)] sm:text-sm ${
    invalid ? 'border-loss' : 'border-border'
  }`

export function PasswordInput({ label, value, invalid, hint, meter, className = '', ...rest }: Props) {
  const t = useT()
  const p = t.auth.pw
  const id = useId()
  const [show, setShow] = useState(false)
  const s = meter ? passwordStrength(value) : null
  const tips = s ? s.missing.slice(0, 2).map((m) => p.tips[m]) : []
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm text-muted">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          {...rest}
          value={value}
          type={show ? 'text' : 'password'}
          aria-invalid={invalid || undefined}
          className={`${fieldClass(invalid)} pr-11 ${className}`}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? p.hide : p.show}
          aria-pressed={show}
          title={show ? p.hide : p.show}
          className="absolute top-1/2 right-1 grid size-9 -translate-y-1/2 place-items-center rounded-md text-muted transition-colors hover:bg-surface hover:text-text"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-[18px]"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
            {/* перечёркивание: видно, пока пароль скрыт; при показе стирается линией */}
            <path
              d="M4 4l16 16"
              className={`[stroke-dasharray:23] transition-[stroke-dashoffset] duration-300 ${show ? '[stroke-dashoffset:23]' : '[stroke-dashoffset:0]'}`}
            />
          </svg>
        </button>
      </div>
      {hint && !meter && <p className="text-xs text-muted">{hint}</p>}
      {s && (
        <div className="flex flex-col gap-1.5" data-meter={s.level}>
          <div className="grid grid-cols-4 gap-1" aria-hidden>
            {[1, 2, 3, 4].map((n) => (
              <i key={n} className={`h-1.5 rounded-full transition-colors duration-300 ${n <= s.level ? LEVEL_BG[s.level] : 'bg-surface-2'}`} />
            ))}
          </div>
          <p className="min-h-[1.25rem] text-xs text-muted" aria-live="polite">
            {s.level > 0 && (
              <>
                <span className={`font-semibold ${LEVEL_TEXT[s.level]}`}>{p.levels[s.level]}</span>
                {' · '}
                {tips.length ? fmt(p.add, { list: tips.join(', ') }) : p.great}
              </>
            )}
            {s.level === 0 && hint}
          </p>
        </div>
      )}
    </div>
  )
}
