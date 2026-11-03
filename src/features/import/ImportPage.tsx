import { PagePlaceholder } from '@/components/PagePlaceholder'
import { useT } from '@/i18n'

export function ImportPage() {
  const t = useT()
  return <PagePlaceholder title={t.pages.import.title} note={t.pages.import.stage} />
}
