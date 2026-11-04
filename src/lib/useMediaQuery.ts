import { useSyncExternalStore } from 'react'

/** true, если экран подходит под медиазапрос (например, «(min-width: 768px)» — планшет и шире) */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}
