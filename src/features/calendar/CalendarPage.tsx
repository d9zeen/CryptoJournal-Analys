/** Вкладка «Календарь»: календарь прибыли по дням (раньше был внизу дашборда) */
import { useT } from '@/i18n'
import { useProfile } from '@/features/settings/api'
import { browserTimeZone } from '@/lib/tz'
import { ProfitCalendar } from './ProfitCalendar'

export function CalendarPage() {
  const t = useT()
  const { data: profile } = useProfile()
  const tz = profile?.timezone || browserTimeZone()

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">{t.calendarPage.title}</h1>
        <p className="mt-1 text-sm text-muted">{t.calendarPage.hint}</p>
      </div>
      <ProfitCalendar timeZone={tz} />
    </div>
  )
}
