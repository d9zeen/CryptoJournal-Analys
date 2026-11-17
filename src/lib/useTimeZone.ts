/**
 * Часовой пояс пользователя для всех сутки-зависимых расчётов: пояс из профиля («Настройки → Профиль»), иначе — браузера.
 * Один источник для «Статистики», «Календаря», списка сделок, «Разбора» и выбора дат — сделка около полуночи
 * везде попадает в один и тот же день.
 */
import { useProfile } from '@/features/settings/api'
import { browserTimeZone } from '@/lib/tz'
import { setDisplayTimeZone } from '@/lib/format'

export function useTimeZone(): string {
  const { data: profile } = useProfile()
  const tz = profile?.timezone || browserTimeZone()
  // время сделок (formatDateTime, форма сделки) — в том же поясе; ставим сразу, до отрисовки детей
  setDisplayTimeZone(tz)
  return tz
}
