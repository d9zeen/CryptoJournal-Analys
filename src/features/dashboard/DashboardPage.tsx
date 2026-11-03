import { PagePlaceholder } from '@/components/PagePlaceholder'
import { useT } from '@/i18n'

export function DashboardPage() {
  const t = useT()
  return <PagePlaceholder title={t.pages.dashboard.title} note={t.pages.dashboard.stage} />
}
