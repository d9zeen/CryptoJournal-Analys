import { useId } from 'react'
import { useT } from '@/i18n'

/** Значок: линия капитала с переходом фиолетовый → мятный (единственное место, где два акцента смешиваются, кроме графика) */
export function LogoMark({ className = 'size-7' }: { className?: string }) {
  const id = useId()
  return (
    <svg viewBox="0 0 32 32" className={`${className} shrink-0 drop-shadow-[0_0_10px_var(--color-glow)]`} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: 'var(--color-primary)' }} />
          <stop offset="1" style={{ stopColor: 'var(--color-accent)' }} />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" className="fill-surface-2" />
      <path d="M6 22l6-7 5 4 9-11" fill="none" stroke={`url(#${id})`} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const t = useT()
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark className={size === 'lg' ? 'size-9' : 'size-7'} />
      <span className={`font-display font-semibold tracking-tight ${size === 'lg' ? 'text-2xl' : 'text-[15px]'}`}>{t.app.name}</span>
    </span>
  )
}
