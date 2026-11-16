/**
 * График стоимости портфеля (Recharts, грузится отдельно): одна фиолетовая линия с мягкой заливкой, как кривая капитала,
 * и пунктир «если бы всё было в BTC» — сколько стоили бы деньги первой точки, переложенные в BTC (образец — 21st.dev web3-bento).
 * До первого снимка — оценка по нынешнему составу (est): та же линия пунктиром, без заливки.
 */
import { useId, useMemo } from 'react'
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useT } from '@/i18n'
import { formatDateTime, formatUsd, formatUsdShort } from '@/lib/format'
import { intlLocale } from '@/lib/locale'
import type { SeriesPoint } from '@/lib/calc/portfolio'

const axisProps = { tick: { fill: 'var(--color-muted)', fontSize: 11 }, tickLine: false, axisLine: false } as const

type TipProps = { active?: boolean; payload?: ReadonlyArray<{ payload?: SeriesPoint }> }

export function PortfolioChart({ points, short }: { points: SeriesPoint[]; short: boolean }) {
  const t = useT()
  const p = t.portfolio.chart
  const id = useId().replace(/:/g, '')
  // ось не от нуля: портфель в 50 000 $ и колебания в 2 % должны быть видны
  const axis = useMemo(() => {
    const values = points.flatMap((x) => [x.value, x.est, x.btc].filter((v): v is number => v !== null))
    const lo = Math.min(...values)
    const hi = Math.max(...values)
    const pad = (hi - lo || hi * 0.05 || 1) * 0.12
    return { lo: Math.max(0, lo - pad), hi: hi + pad }
  }, [points])
  // подписи оси — по полуночам (не больше ~7), иначе за неделю выходит «12 нояб., 12 нояб.»
  const ticks = useMemo(() => {
    if (short || points.length < 2) return undefined
    const lo = points[0].t
    const hi = points[points.length - 1].t
    const days = (hi - lo) / 864e5
    if (days < 2) return undefined
    const step = Math.ceil(days / 7) * 864e5
    const d = new Date(lo)
    d.setHours(24, 0, 0, 0)
    const out: number[] = []
    for (let t = d.getTime(); t <= hi; t += step) out.push(t)
    return out
  }, [points, short])
  const fmtTick = (ms: number) =>
    new Intl.DateTimeFormat(intlLocale(), short ? { hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short' }).format(new Date(ms))
  const color = 'var(--color-primary)'
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={points} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
            <stop offset={0} stopColor={color} stopOpacity={0.26} />
            <stop offset={1} stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--color-border)" vertical={false} />
        <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} {...axisProps} tickFormatter={fmtTick} ticks={ticks} minTickGap={48} />
        <YAxis {...axisProps} width={64} orientation="right" domain={[axis.lo, axis.hi]} tickFormatter={(v: number) => formatUsdShort(v)} allowDataOverflow />
        <Tooltip
          cursor={{ stroke: 'var(--color-muted)', strokeOpacity: 0.4 }}
          content={(props) => {
            const pt = (props as TipProps).active ? (props as TipProps).payload?.[0]?.payload : undefined
            if (!pt) return null
            return (
              <div className="num rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs shadow-lg">
                <div className="text-muted">{formatDateTime(new Date(pt.t).toISOString())}</div>
                <div className="mt-0.5 text-sm font-semibold">{formatUsd(pt.value ?? pt.est ?? 0)}</div>
                {pt.value === null && <div className="text-muted">{p.estimate}</div>}
                {pt.btc !== null && (
                  <div className="mt-1 flex justify-between gap-4 text-muted">
                    <span>{p.btc}</span>
                    <span>{formatUsd(pt.btc)}</span>
                  </div>
                )}
              </div>
            )
          }}
        />
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#${id}f)`} dot={false} isAnimationActive={false}
          activeDot={{ r: 4.5, fill: color, stroke: 'var(--color-surface)', strokeWidth: 2 }} />
        <Line type="monotone" dataKey="est" stroke={color} strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false}
          activeDot={{ r: 4.5, fill: color, stroke: 'var(--color-surface)', strokeWidth: 2 }} />
        <Line type="monotone" dataKey="btc" stroke="var(--color-muted)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} connectNulls />
      </AreaChart>
    </ResponsiveContainer>
  )
}
