import type { ReactNode } from 'react'

type Tone = 'error' | 'success' | 'info'

const styles: Record<Tone, string> = {
  error: 'border-loss/40 bg-loss/10 text-loss',
  success: 'border-profit/40 bg-profit/10 text-profit',
  info: 'border-primary/40 bg-primary/10 text-text',
}

export function Alert({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-3 py-2.5 text-sm ${styles[tone]}`}>
      {children}
    </div>
  )
}
