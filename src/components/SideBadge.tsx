import { useT } from '@/i18n'

/** Направление сделки: нейтральная плашка со стрелкой (не цветом прибыли / убытка — Long не значит «в плюс») */
export function SideBadge({ side }: { side: 'long' | 'short' }) {
  const t = useT()
  return (
    <span className="inline-flex items-center gap-0.5 rounded bg-surface-2 px-1.5 py-0.5 text-xs font-semibold tracking-wide text-text uppercase">
      <span aria-hidden>{side === 'long' ? '↗' : '↘'}</span>
      {t.side[side]}
    </span>
  )
}
