import type { InputHTMLAttributes } from 'react'

export function Checkbox({ label, className = '', ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={`inline-flex cursor-pointer items-center gap-2 text-sm ${className}`}>
      <input type="checkbox" {...rest} className="size-4 accent-[var(--color-primary)]" />
      {label}
    </label>
  )
}
