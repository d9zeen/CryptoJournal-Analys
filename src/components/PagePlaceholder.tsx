import { Card } from '@/components/ui/Card'
import { useT } from '@/i18n'

export function PagePlaceholder({ title, note }: { title: string; note: string }) {
  const t = useT()
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">{title}</h1>
      <Card>
        <p className="text-muted">{t.common.comingSoon}</p>
        <p className="mt-1 text-sm text-muted/70">{note}</p>
      </Card>
    </div>
  )
}
