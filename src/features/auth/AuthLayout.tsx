import type { ReactNode, RefObject } from 'react'
import { Card } from '@/components/ui/Card'
import { Logo } from '@/components/Logo'
import { useT } from '@/i18n'
import { LangSwitch } from '@/components/LangSwitch'
import { ThemeToggle } from '@/components/ThemeToggle'

/** cardRef — карточка формы (useShake: «мотает головой» при ошибке) */
export function AuthLayout({ title, children, cardRef }: { title: string; children: ReactNode; cardRef?: RefObject<HTMLDivElement | null> }) {
  const t = useT()
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      {/* язык и тема — в углу, до входа их тоже можно поменять */}
      <div className="absolute top-3 right-3 flex items-center gap-1">
        <LangSwitch />
        <ThemeToggle />
      </div>
      <div className="rise mb-6 flex flex-col items-center gap-2 text-center">
        <Logo size="lg" />
        <div className="text-sm text-muted">{t.app.tagline}</div>
      </div>
      <div ref={cardRef} className="w-full max-w-sm">
        <Card className="rise w-full [--i:1]">
          <h1 className="mb-5 text-lg font-semibold">{title}</h1>
          {children}
        </Card>
      </div>
      <p className="mt-6 max-w-sm text-center text-xs leading-relaxed text-muted">{t.app.authFooter}</p>
    </div>
  )
}
