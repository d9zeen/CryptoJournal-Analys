import type { ReactNode } from 'react'
import { Card } from '@/components/ui/Card'
import { Logo } from '@/components/Logo'
import { useT } from '@/i18n'

export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  const t = useT()
  return (
    <div className="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10">
      {/* мягкое «северное сияние» за карточкой: фиолетовый и мятный, без радуги */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 -z-10 size-[44rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60 blur-3xl"
        style={{
          background:
            'radial-gradient(circle at 35% 40%, color-mix(in srgb, var(--color-primary) 22%, transparent), transparent 60%), radial-gradient(circle at 65% 60%, color-mix(in srgb, var(--color-accent) 14%, transparent), transparent 60%)',
        }}
      />
      <div className="rise mb-6 flex flex-col items-center gap-2 text-center">
        <Logo size="lg" />
        <div className="text-sm text-muted">{t.app.tagline}</div>
      </div>
      <Card className="rise w-full max-w-sm [--i:1]">
        <h1 className="mb-5 text-lg font-semibold">{title}</h1>
        {children}
      </Card>
    </div>
  )
}
