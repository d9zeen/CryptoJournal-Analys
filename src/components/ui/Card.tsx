import type { HTMLAttributes } from 'react'

export function Card({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={`rounded-xl border border-border bg-surface p-5 sm:p-6 ${className}`} />
}
