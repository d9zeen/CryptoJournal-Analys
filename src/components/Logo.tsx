import { useT } from '@/i18n'

/** Контуры значка (viewBox 64): «разорванный» шестиугольник и звезда — общие для LogoMark и «Воронки» на главной (fx/ExchangeVortex) */
export const LOGO_HEX = 'M14.68 26V22L32 12L49.32 22V26M14.68 38V42L32 52L49.32 42V38'
export const LOGO_STAR = 'M32 9C34 30 34 30 56 32C34 34 34 34 32 55C30 34 30 34 8 32C30 30 30 30 32 9Z'

/**
 * Значок (20.11.2026, выбор владельца): четырёхлучевая звезда в «разорванном» шестиугольнике — открыт слева и справа,
 * горизонтальные лучи выходят наружу. Плоский цвет, без градиентов и свечения. Цвета — токены --color-logo* (theme.css):
 * в тёмной теме плитка тёмная, в светлой — цвета карточек с рамкой.
 */
export function LogoMark({ className = 'size-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={`${className} shrink-0`} aria-hidden>
      <rect x="1" y="1" width="62" height="62" rx="14" className="fill-logo-tile stroke-logo-tile-border" strokeWidth={1.5} />
      <path
        d={LOGO_HEX}
        fill="none"
        className="stroke-logo"
        strokeOpacity={0.55}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d={LOGO_STAR} className="fill-logo" />
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
