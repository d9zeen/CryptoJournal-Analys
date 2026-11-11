/**
 * №12 «Пришла новая сделка»: синхронизация с биржей отмечает момент, когда добавила сделки.
 * Список сделок анимирует новые строки, только если они пришли от синхронизации (не при первой загрузке и не при импорте файла).
 */
import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from './motion'

let syncedAt = 0

/** Синхронизация с биржей только что добавила сделки */
export function markSynced() {
  syncedAt = Date.now()
}

const recent = () => Date.now() - syncedAt < 20_000

/** Больше — без анимации (пачка истории, а не «пришла сделка») */
export const MAX_ARRIVALS = 10

/**
 * Какие id новые по сравнению с прошлой загрузкой того же списка. ready — данные этого списка на экране (не прежние, пока грузятся);
 * key — что за список (период): сменился — сравнение начинается заново. Подсветка гаснет через ~1.7 с.
 */
export function useArrivals(ids: string[] | undefined, ready: boolean, key: unknown): Set<string> {
  const prev = useRef<{ key: unknown; ids: Set<string> } | null>(null)
  const [fresh, setFresh] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    if (!ready || !ids) return
    const before = prev.current
    prev.current = { key, ids: new Set(ids) }
    if (!before || before.key !== key) return // первая загрузка или другой период
    const added = ids.filter((id) => !before.ids.has(id))
    if (!added.length || added.length > MAX_ARRIVALS || !recent() || prefersReducedMotion()) return
    setFresh(new Set(added))
    const t = window.setTimeout(() => setFresh(new Set()), 1700)
    return () => window.clearTimeout(t)
  }, [ids, ready, key])

  return fresh
}
