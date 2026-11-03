import { PagePlaceholder } from '@/components/PagePlaceholder'
import { useT } from '@/i18n'

export function TradesPage() {
  const t = useT()
  return <PagePlaceholder title={t.pages.trades.title} note={t.pages.trades.stage} />
}
