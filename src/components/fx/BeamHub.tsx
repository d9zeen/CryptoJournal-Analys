/**
 * №1 «Поток в дневник» (образец — 21st.dev animated-beam): биржи слева и справа, дневник в центре, между ними — линии.
 * По линиям подключённых бирж бегут огоньки (stroke-dashoffset), у неподключённых — только серая линия.
 * fast — биржа сейчас синхронизируется: огонёк бежит быстрее. Значки — HTML поверх SVG (в процентах), поэтому подписи не тянутся.
 * При «уменьшить движение» огоньки стоят (видна часть линии).
 */
import { useId } from 'react'

export type HubNode = { id: string; mono: string; name: string; on: boolean; fast?: boolean; note?: string }

const W = 640
const H = 260

export function BeamHub({ nodes, caption, className = '' }: { nodes: HubNode[]; caption?: string; className?: string }) {
  const gid = useId().replace(/:/g, '')
  const list = nodes.slice(0, 6)
  const half = Math.ceil(list.length / 2)
  const pos = list.map((_, i) => {
    const left = i < half
    const k = left ? i : i - half
    const count = left ? half : list.length - half
    const y = count === 1 ? H / 2 : 36 + (k * (H - 72)) / (count - 1)
    return [left ? 64 : W - 64, y] as const
  })
  const cx = W / 2
  const cy = H / 2
  return (
    // картинка-украшение: те же биржи списком есть рядом (сетка / пилюли), чтению с экрана не мешаем
    <div data-beam-hub aria-hidden className={`relative w-full ${className}`}>
      <div className="relative mx-auto aspect-[640/260] w-full max-w-[640px]">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
          <defs>
            <linearGradient id={`${gid}l`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="var(--color-accent)" stopOpacity="0" />
              <stop offset="0.5" stopColor="var(--color-accent)" />
              <stop offset="1" stopColor="var(--color-primary)" />
            </linearGradient>
            <linearGradient id={`${gid}r`} x1="1" y1="0" x2="0" y2="0">
              <stop offset="0" stopColor="var(--color-accent)" stopOpacity="0" />
              <stop offset="0.5" stopColor="var(--color-accent)" />
              <stop offset="1" stopColor="var(--color-primary)" />
            </linearGradient>
          </defs>
          {list.map((n, i) => {
            const [x, y] = pos[i]
            const d = `M${x},${y} C${(x + cx) / 2},${y} ${(x + cx) / 2},${cy} ${cx},${cy}`
            return (
              <g key={n.id}>
                <path d={d} fill="none" stroke="var(--color-border)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
                {n.on && (
                  <path
                    d={d}
                    fill="none"
                    stroke={`url(#${gid}${x < cx ? 'l' : 'r'})`}
                    strokeWidth={2.4}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    pathLength={100}
                    className={`hub-beam ${n.fast ? 'hub-beam-fast' : ''}`}
                    style={{ animationDelay: `${i * 0.45}s` }}
                  />
                )}
              </g>
            )
          })}
        </svg>
        {list.map((n, i) => {
          const [x, y] = pos[i]
          return (
            <div
              key={n.id}
              data-hub-node={n.id}
              data-on={n.on || undefined}
              className="absolute flex -translate-1/2 flex-col items-center gap-1"
              style={{ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` }}
            >
              <span
                className={`num grid size-11 place-items-center rounded-xl border text-xs font-bold sm:size-13 ${n.on ? 'border-primary/50 bg-surface-2 text-text' : 'border-border bg-surface-2/60 text-muted'}`}
              >
                {n.mono}
              </span>
              <span className="hidden text-xs whitespace-nowrap text-muted sm:block">{n.name}</span>
            </div>
          )
        })}
        <div className="absolute top-1/2 left-1/2 grid size-16 -translate-1/2 place-items-center rounded-2xl border border-primary/60 bg-primary/14 text-primary sm:size-20">
          <svg viewBox="0 0 24 24" className="size-7 sm:size-8" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 17l5-5 4 4 8-9" />
            <path d="M14 7h6v6" />
          </svg>
        </div>
      </div>
      {caption && <p className="mt-2 text-center text-xs text-muted">{caption}</p>}
    </div>
  )
}
