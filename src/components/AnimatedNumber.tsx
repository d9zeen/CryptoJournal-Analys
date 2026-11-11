import { useEffect, useRef } from 'react'
import { useCountUp } from '@/lib/motion'
import { RollNumber } from './RollNumber'

/**
 * Число на дашборде:
 * - первый показ — набегает от 0 (№8, ~1 с, синхронно со шкалами);
 * - сменился rollKey (период, $ / %) — прокручивается (№13);
 * - значение изменилось само (пришла новая сделка) — плавно пересчитывается от старого к новому (№12).
 */
export function AnimatedNumber({ value, format, rollKey, className }: { value: number; format: (n: number) => string; rollKey?: unknown; className?: string }) {
  const keyChanged = useRef(false)
  const prevKey = useRef(rollKey)
  if (prevKey.current !== rollKey) {
    keyChanged.current = true
    prevKey.current = rollKey
  }
  const shown = useCountUp(value, 1000, keyChanged.current)
  useEffect(() => {
    keyChanged.current = false
  })
  return <RollNumber text={format(shown)} token={rollKey} className={className} />
}
