import { useT } from '@/i18n'

/** Значок: линия капитала цветом текста, последний отрезок — мятный (без градиентов и свечения) */
export function LogoMark({ className = 'size-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={`${className} shrink-0`} aria-hidden>
      <rect x="0.75" y="0.75" width="30.5" height="30.5" rx="7" className="fill-surface-2 stroke-border" strokeWidth={1.5} />
      <path d="M7 21.5l5.5-6.5 4.5 3.5" fill="none" className="stroke-text" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 18.5l8-9.5" fill="none" className="stroke-accent" strokeWidth={2.6} strokeLinecap="round" />
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
