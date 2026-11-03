/**
 * Графики дашборда (Recharts). Файл грузится отдельно (lazy), чтобы не утяжелять первый экран.
 * Цвета — только CSS-переменные из theme.css.
 */
import type { ReactNode } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmt, useT } from '@/i18n'
import { formatDateTime, formatDay, formatDayShort, formatPnl, formatUsdShort, pnlClass } from '@/lib/format'
import type { DayPnl, EquityPoint } from '@/lib/calc/stats'

const C = {
  profit: 'var(--color-profit)',
  loss: 'var(--color-loss)',
  primary: 'var(--color-primary)',
  muted: 'var(--color-muted)',
  grid: 'var(--color-border)',
}

const axisProps = {
  tick: { fill: C.muted, fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const

const HEIGHT = 220

/** Всплывающая подсказка в стиле приложения */
function Tip({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs shadow-lg">{children}</div>
}

// Recharts передаёт в content объект с payload; данные точки — в payload[0].payload
type TipProps<T> = { active?: boolean; payload?: ReadonlyArray<{ payload?: T }> }
const pointOf = <T,>(p: TipProps<T>): T | undefined => (p.active ? p.payload?.[0]?.payload : undefined)

export function EquityChart({ points }: { points: EquityPoint[] }) {
  const t = useT()
  const last = points[points.length - 1]?.cum ?? 0
  const color = last >= 0 ? C.profit : C.loss
  return (
    <ResponsiveContainer width="100%" height={HEIGHT}>
      <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="n" {...axisProps} minTickGap={24} />
        <YAxis {...axisProps} width={56} tickFormatter={formatUsdShort} />
        <ReferenceLine y={0} stroke={C.muted} strokeOpacity={0.5} />
        <Tooltip
          cursor={{ stroke: C.muted, strokeOpacity: 0.4 }}
          content={(props) => {
            const p = pointOf<EquityPoint>(props as TipProps<EquityPoint>)
            if (!p) return null
            return (
              <Tip>
                <div className="text-muted">{p.n === 0 ? t.dashboard.charts.start : `${fmt(t.dashboard.charts.tradeN, { n: p.n })} · ${formatDateTime(p.at)}`}</div>
                <div className={`mt-0.5 font-medium ${pnlClass(p.cum)}`}>{formatPnl(p.cum)}</div>
                {p.n > 0 && <div className={pnlClass(p.pnl)}>{formatPnl(p.pnl)}</div>}
              </Tip>
            )
          }}
        />
        <Area type="monotone" dataKey="cum" stroke={color} strokeWidth={2} fill="url(#equityFill)" dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function DailyPnlChart({ days }: { days: DayPnl[] }) {
  const t = useT()
  return (
    <ResponsiveContainer width="100%" height={HEIGHT}>
      <BarChart data={days} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" {...axisProps} tickFormatter={formatDayShort} minTickGap={16} />
        <YAxis {...axisProps} width={56} tickFormatter={formatUsdShort} />
        <ReferenceLine y={0} stroke={C.muted} strokeOpacity={0.5} />
        <Tooltip
          cursor={{ fill: C.grid, fillOpacity: 0.4 }}
          content={(props) => {
            const d = pointOf<DayPnl>(props as TipProps<DayPnl>)
            if (!d) return null
            return (
              <Tip>
                <div className="text-muted">{formatDay(d.date)}</div>
                <div className={`mt-0.5 font-medium ${pnlClass(d.pnl)}`}>{formatPnl(d.pnl)}</div>
                <div className="text-muted">{fmt(t.dashboard.tooltipTrades, { n: d.count })}</div>
              </Tip>
            )
          }}
        />
        <Bar dataKey="pnl" radius={[3, 3, 0, 0]} maxBarSize={28} isAnimationActive={false}>
          {days.map((d) => (
            <Cell key={d.date} fill={d.pnl >= 0 ? C.profit : C.loss} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export type Bucket = { label: string; pnl: number; count: number }

/** Столбики PnL по корзинам (дни недели, часы) */
export function BucketChart({ data }: { data: Bucket[] }) {
  const t = useT()
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={4} />
        <YAxis {...axisProps} width={56} tickFormatter={formatUsdShort} />
        <ReferenceLine y={0} stroke={C.muted} strokeOpacity={0.5} />
        <Tooltip
          cursor={{ fill: C.grid, fillOpacity: 0.4 }}
          content={(props) => {
            const b = pointOf<Bucket>(props as TipProps<Bucket>)
            if (!b) return null
            return (
              <Tip>
                <div className="text-muted">{b.label}</div>
                <div className={`mt-0.5 font-medium ${pnlClass(b.pnl)}`}>{formatPnl(b.pnl)}</div>
                <div className="text-muted">{fmt(t.dashboard.tooltipTrades, { n: b.count })}</div>
              </Tip>
            )
          }}
        />
        <Bar dataKey="pnl" radius={[3, 3, 0, 0]} maxBarSize={28} isAnimationActive={false}>
          {data.map((b) => (
            <Cell key={b.label} fill={b.pnl >= 0 ? C.profit : C.loss} fillOpacity={b.count ? 1 : 0} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
