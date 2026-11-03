import type { ButtonHTMLAttributes } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }

export function Chip({ active, className = '', ...rest }: Props) {
  return (
    <button
      type="button"
      aria-pressed={active}
      {...rest}
      className={`rounded-full border px-3 py-1 text-sm transition-colors ${active ? 'border-loss/50 bg-loss/15 text-loss' : 'border-border text-muted hover:border-muted hover:text-text'} ${className}`}
    />
  )
}
