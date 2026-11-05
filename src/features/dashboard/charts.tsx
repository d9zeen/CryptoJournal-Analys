/**
 * Графики дашборда (Recharts). Файл грузится отдельно (lazy), чтобы не утяжелять первый экран.
 * Цвета — только CSS-переменные из theme.css.
 */
import { useMemo, type ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmt, useT } from '@/i18n'
import { formatDateTime, formatDay, formatDayShort, formatNumber, formatPnl, formatUsdShort, pnlClass } from '@/lib/format'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { formatUnit, inUnit, shortDate, withTime, type EquityUnit, type TimedPoint } from './equityTime'
import type { BarUnit, DayPnl, EquityPoint } from '@/lib/calc/stats'
import { prefersReducedMotion } from '@/lib/motion'

const C = {
  profit: 'var(--color-profit)',
  loss: 'var(--color-loss)',
  primary: 'var(--color-primary)',
  accent: 'var(--color-accent)',
  muted: 'var(--color-muted)',
  grid: 'var(--color-border)',
}

const axisProps = {
  tick: { fill: C.muted, fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const

const HEIGHT = 220

// графики «прорисовываются» при открытии (кроме режима «уменьшить движение»)
const anim = () => (prefersReducedMotion() ? { isAnimationActive: false } : { isAnimationActive: true, animationDuration: 900, animationEasing: 'ease-out' as const })

/** Всплывающая подсказка в стиле приложения */
function Tip({ children }: { children: ReactNode }) {
  return <div className="num rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs shadow-lg">{children}</div>
}

// Recharts передаёт в content объект с payload; данные точки — в payload[0].payload
type TipProps<T> = { active?: boolean; payload?: ReadonlyArray<{ payload?: T }> }
const pointOf = <T,>(p: TipProps<T>): T | undefined => (p.active ? p.payload?.[0]?.payload : undefined)

type EqRow = TimedPoint & { v: number; trade: number; fromPeak: number }

/**
 * Кривая капитала: белая гладкая линия с мягким неоном (класс equity-neon в theme.css), без заливки.
 * Ось X — даты (расстояние между точками = реальное время), подпись итога у последней точки.
 */
export function EquityChart({ points, unit, balance }: { points: EquityPoint[]; unit: EquityUnit; balance: number | null }) {
  const t = useT()
  const wide = useMediaQuery('(min-width: 640px)')
  const data = useMemo<EqRow[]>(() => {
    let peak = -Infinity
    return withTime(points).map((p) => {
      const v = inUnit(p.cum, unit, balance)
      peak = Math.max(peak, v)
      return { ...p, v, trade: inUnit(p.pnl, unit, balance), fromPeak: v - peak }
    })
  }, [points, unit, balance])
  const last = data[data.length - 1]
  const yTick = (v: number) => (unit === 'usd' ? formatUsdShort(v) : `${formatNumber(v, 0)} %`)
  return (
    <div className="equity-neon">
      <ResponsiveContainer width="100%" height={HEIGHT + 40}>
        <LineChart data={data} margin={{ top: 22, right: wide ? 104 : 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} {...axisProps} tickFormatter={shortDate} minTickGap={40} />
          <YAxis {...axisProps} width={60} tickFormatter={yTick} />
          <ReferenceLine y={0} stroke={C.muted} strokeOpacity={0.5} />
          <Tooltip
            cursor={{ stroke: C.muted, strokeOpacity: 0.4 }}
            content={(props) => {
              const p = pointOf<EqRow>(props as TipProps<EqRow>)
              if (!p) return null
              return (
                <Tip>
                  <div className="text-muted">{p.n === 0 ? t.dashboard.charts.start : formatDateTime(p.at)}</div>
                  <div className={`mt-0.5 text-sm font-semibold ${pnlClass(p.v)}`}>{formatUnit(p.v, unit)}</div>
                  {p.n > 0 && (
                    <>
                      <div className="mt-1 flex justify-between gap-4">
                        <span className="text-muted">{p.symbol ?? t.dashboard.charts.trade}</span>
                        <span className={pnlClass(p.trade)}>{formatUnit(p.trade, unit)}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted">{t.dashboard.charts.fromPeak}</span>
                        <span>{p.fromPeak < -1e-9 ? formatUnit(p.fromPeak, unit) : t.dashboard.charts.atPeak}</span>
                      </div>
                    </>
                  )}
                </Tip>
              )
            }}
          />
          <Line
            type="monotone"
            dataKey="v"
            stroke="var(--color-text)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5, fill: 'var(--color-text)', stroke: 'var(--color-surface)', strokeWidth: 2 }}
            {...anim()}
          />
          {last && (
            <ReferenceDot
              x={last.t}
              y={last.v}
              r={4.5}
              fill="var(--color-text)"
              stroke="var(--color-surface)"
              strokeWidth={2}
              label={{
                value: formatUnit(last.v, unit),
                position: wide ? 'right' : 'top',
                offset: 10,
                fill: 'var(--color-text)',
                fontSize: 12,
                fontWeight: 600,
                fontFamily: 'var(--font-mono)',
                ...(wide ? {} : { textAnchor: 'end' }),
              }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/** «2026-11-01» → подпись оси и подсказки в зависимости от того, что в столбике: день, неделя или месяц */
function barLabels(unit: BarUnit, t: ReturnType<typeof useT>) {
  const month = (d: string) => `${d.slice(5, 7)}.${d.slice(0, 4)}`
  if (unit === 'month') return { tick: month, title: (d: string) => fmt(t.dashboard.charts.monthOf, { m: month(d) }) }
  if (unit === 'week') return { tick: formatDayShort, title: (d: string) => fmt(t.dashboard.charts.weekOf, { d: formatDay(d) }) }
  return { tick: formatDayShort, title: formatDay }
}

export function DailyPnlChart({ days, unit = 'day' }: { days: DayPnl[]; unit?: BarUnit }) {
  const t = useT()
  const labels = barLabels(unit, t)
  return (
    <ResponsiveContainer width="100%" height={HEIGHT}>
      <BarChart data={days} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" {...axisProps} tickFormatter={labels.tick} minTickGap={16} />
        <YAxis {...axisProps} width={56} tickFormatter={formatUsdShort} />
        <ReferenceLine y={0} stroke={C.muted} strokeOpacity={0.5} />
        <Tooltip
          cursor={{ fill: C.grid, fillOpacity: 0.4 }}
          content={(props) => {
            const d = pointOf<DayPnl>(props as TipProps<DayPnl>)
            if (!d) return null
            return (
              <Tip>
                <div className="text-muted">{labels.title(d.date)}</div>
                <div className={`mt-0.5 font-medium ${pnlClass(d.pnl)}`}>{formatPnl(d.pnl)}</div>
                <div className="text-muted">{fmt(t.dashboard.tooltipTrades, { n: d.count })}</div>
              </Tip>
            )
          }}
        />
        <Bar dataKey="pnl" radius={[4, 4, 0, 0]} maxBarSize={28} {...anim()}>
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
        <Bar dataKey="pnl" radius={[4, 4, 0, 0]} maxBarSize={28} {...anim()}>
          {data.map((b) => (
            <Cell key={b.label} fill={b.pnl >= 0 ? C.profit : C.loss} fillOpacity={b.count ? 1 : 0} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
