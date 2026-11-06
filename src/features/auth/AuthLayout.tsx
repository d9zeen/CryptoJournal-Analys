import type { ReactNode } from 'react'
import { Card } from '@/components/ui/Card'
import { Logo } from '@/components/Logo'
import { useT } from '@/i18n'

export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  const t = useT()
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="rise mb-6 flex flex-col items-center gap-2 text-center">
        <Logo size="lg" />
        <div className="text-sm text-muted">{t.app.tagline}</div>
      </div>
      <Card className="rise w-full max-w-sm [--i:1]">
        <h1 className="mb-5 text-lg font-semibold">{title}</h1>
        {children}
      </Card>
      <p className="mt-6 max-w-sm text-center text-xs leading-relaxed text-muted">{t.app.authFooter}</p>
    </div>
  )
}
