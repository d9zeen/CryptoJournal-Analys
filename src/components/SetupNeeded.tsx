import { Card } from '@/components/ui/Card'
import { useT } from '@/i18n'

/** Показывается, если не заданы переменные Supabase — вместо белого экрана. */
export function SetupNeeded() {
  const t = useT()
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <Card className="max-w-md">
        <h1 className="mb-2 text-lg font-semibold">{t.setup.title}</h1>
        <p className="text-sm text-muted">{t.setup.text}</p>
      </Card>
    </div>
  )
}
