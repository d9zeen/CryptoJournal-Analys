import type { ReactNode } from 'react'
import { Card } from '@/components/ui/Card'
import { useT } from '@/i18n'

export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  const t = useT()
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <div className="text-2xl font-semibold tracking-tight">{t.app.name}</div>
        <div className="mt-1 text-sm text-muted">{t.app.tagline}</div>
      </div>
      <Card className="w-full max-w-sm">
        <h1 className="mb-5 text-lg font-semibold">{title}</h1>
        {children}
      </Card>
    </div>
  )
}
