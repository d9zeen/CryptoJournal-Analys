/** Вкладка «Календарь»: календарь прибыли на всю ширину (раньше был внизу дашборда) */
import { useProfile } from '@/features/settings/api'
import { browserTimeZone } from '@/lib/tz'
import { ProfitCalendar } from './ProfitCalendar'

export function CalendarPage() {
  const { data: profile } = useProfile()
  return <ProfitCalendar timeZone={profile?.timezone || browserTimeZone()} />
}
