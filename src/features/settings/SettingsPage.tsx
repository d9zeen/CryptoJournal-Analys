import { Card } from '@/components/ui/Card'
import { useAuth } from '@/features/auth/AuthProvider'
import { useT } from '@/i18n'

export function SettingsPage() {
  const t = useT()
  const { user } = useAuth()
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t.pages.settings.title}</h1>
      <Card>
        <h2 className="mb-2 text-sm text-muted">{t.pages.settings.account}</h2>
        <p>{user?.email}</p>
      </Card>
      <Card>
        <p className="text-muted">{t.common.comingSoon}</p>
        <p className="mt-1 text-sm text-muted/70">{t.pages.settings.stage}</p>
      </Card>
    </div>
  )
}
