/**
 * График стоимости портфеля — как кривая капитала в «Статистике» (выбор владельца 16.11.2026, features/dashboard/charts.tsx EquityChart):
 * одна сплошная фиолетовая линия с мягкой заливкой, без пунктиров; ось X — по порядку точек (без длинных прямых в паузах),
 * подписи — даты; на конце — точка с итогом; кривая открывается слева направо («шторка» .eq-draw / .eq-curtain в theme.css).
 * До первого снимка — оценка по нынешнему составу (est): та же линия, «оценка» — только в подсказке.
 * «Если бы всё было в BTC» — тоже в подсказке, отдельной линии нет.
 */
import { useId, useMemo, useRef } from 'react'
import { Area, AreaChart, CartesianGrid, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useT } from '@/i18n'
import { formatDateTime, formatPercent, formatUsd, formatUsdShort } from '@/lib/format'
import { fitAxis } from '@/lib/calc/axis'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { intlLocale } from '@/lib/locale'
import { shortDate } from '@/features/dashboard/equityTime'
import type { SeriesPoint } from '@/lib/calc/portfolio'

const axisProps = { tick: { fill: 'var(--color-muted)', fontSize: 11 }, tickLine: false, axisLine: false } as const
const signedPct = (v: number, digits = 1) => (v > 0 ? '+' : v < 0 ? '−' : '') + formatPercent(Math.abs(v), digits)

type Row = { i: number; t: number; v: number; est: boolean; btc: number | null }
/** Точка под курсором — для большой цифры над графиком (страница «Портфель»): start — значение в начале периода */
export type Scrub = { t: number; v: number; est: boolean; btc: number | null; start: number }
type TipProps = { active?: boolean; payload?: ReadonlyArray<{ payload?: Row }> }

/** pct — значения в процентах к первой точке (100 = начало): портфель по ссылке со скрытыми суммами */
export function PortfolioChart({
  points,
  short,
  pct = false,
  drawKey,
  onScrub,
}: {
  points: SeriesPoint[]
  short: boolean
  pct?: boolean
  drawKey?: unknown
  /** есть — подсказки нет: значение под курсором показывает сама страница (крупно над графиком) */
  onScrub?: (s: Scrub | null) => void
}) {
  const t = useT()
  const p = t.portfolio.chart
  const id = useId().replace(/:/g, '')
  const inside = useRef(false)
  const wide = useMediaQuery('(min-width: 640px)')
  const money = (v: number) => (pct ? signedPct((v - 100) / 100) : formatUsd(v))
  const moneyShort = (v: number) => (pct ? signedPct((v - 100) / 100, 0) : formatUsdShort(v))
  const data = useMemo<Row[]>(
    () =>
      points
        .map((x) => ({ t: x.t, v: x.value ?? x.est, est: x.value === null, btc: x.btc }))
        .filter((x): x is Omit<Row, 'i'> & { v: number } => x.v !== null)
        .map((x, i) => ({ ...x, i })),
    [points],
  )
  const axis = useMemo(() => fitAxis(data.map((d) => d.v)), [data])
  const last = data[data.length - 1]
  const label = useMemo(() => {
    const hm = new Intl.DateTimeFormat(intlLocale(), { hour: '2-digit', minute: '2-digit' })
    return (ts: number) => (short ? hm.format(ts) : shortDate(ts))
  }, [short])
  // ось X — по номеру точки, поэтому подписи ставим сами: первая точка каждой новой даты (иначе «12.11, 12.11» на широком экране),
  // из них — не больше 6 (на телефоне 4), равномерно
  const ticks = useMemo(() => {
    const firsts = data.filter((d, i) => i === 0 || label(d.t) !== label(data[i - 1].t)).map((d) => d.i)
    const max = wide ? 6 : 4
    if (firsts.length <= max) return firsts
    const step = (firsts.length - 1) / (max - 1)
    return [...new Set(Array.from({ length: max }, (_, k) => firsts[Math.round(k * step)]))]
  }, [data, label, wide])
  const tick = (i: number) => {
    const d = data[Math.round(i)]
    return d ? label(d.t) : ''
  }
  const color = 'var(--color-primary)'
  const right = wide ? 104 : 16
  return (
    // мышь над графиком — по самому блоку: Recharts присылает движение с задержкой (кадр), и после быстрого ухода
    // запоздавшее движение снова ставило точку — крупная цифра «застревала» на прошлом значении
    <div
      key={String(drawKey)}
      className="eq-draw relative h-full"
      onPointerMove={() => (inside.current = true)}
      onPointerLeave={() => {
        inside.current = false
        onScrub?.(null)
      }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 22, right, bottom: 0, left: 0 }}
          onMouseMove={(st) => {
            if (!onScrub || !inside.current) return
            const d = data[Number(st?.activeTooltipIndex)]
            onScrub(d ? { t: d.t, v: d.v, est: d.est, btc: d.btc, start: data[0].v } : null)
          }}
          onMouseLeave={() => onScrub?.(null)}
        >
          <defs>
            <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor={color} stopOpacity={0.26} />
              <stop offset={1} stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="i" type="number" domain={['dataMin', 'dataMax']} {...axisProps} ticks={ticks} interval="preserveStartEnd" tickFormatter={tick} minTickGap={24} />
          <YAxis {...axisProps} width={60} domain={[axis.lo, axis.hi]} ticks={axis.ticks} tickFormatter={(v: number) => moneyShort(v)} allowDataOverflow />
          <Tooltip
            cursor={{ stroke: 'var(--color-muted)', strokeOpacity: 0.4 }}
            content={(props) => {
              const pt = (props as TipProps).active ? (props as TipProps).payload?.[0]?.payload : undefined
              if (!pt || onScrub) return null
              return (
                <div className="num rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs shadow-lg">
                  <div className="text-muted">{formatDateTime(new Date(pt.t).toISOString())}</div>
                  <div className="mt-0.5 text-sm font-semibold">{money(pt.v)}</div>
                  {pt.est && <div className="mt-0.5 text-muted">{p.estimate}</div>}
                  {pt.btc !== null && !pct && (
                    <div className="mt-1 flex justify-between gap-4 text-muted">
                      <span>{p.btc}</span>
                      <span>{formatUsd(pt.btc)}</span>
                    </div>
                  )}
                </div>
              )
            }}
          />
          <Area
            type="monotone"
            dataKey="v"
            baseValue="dataMin"
            stroke={color}
            fill={`url(#${id}f)`}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4.5, fill: color, stroke: 'var(--color-surface)', strokeWidth: 2 }}
            isAnimationActive={false}
          />
          {last && (
            <ReferenceDot
              x={last.i}
              y={last.v}
              r={4.5}
              fill={color}
              stroke="var(--color-surface)"
              strokeWidth={2}
              label={{
                value: money(last.v),
                position: wide ? 'right' : 'top',
                offset: 10,
                fill: 'var(--color-text)',
                fontSize: 12,
                fontWeight: 600,
                fontFamily: 'var(--font-sans)',
                ...(wide ? {} : { textAnchor: 'end' }),
              }}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
      {/* шторка над областью графика: слева ось Y (60px), справа подпись итога, снизу ось X */}
      <div aria-hidden className="pointer-events-none absolute top-0 bottom-[30px] left-[60px] overflow-hidden" style={{ right }}>
        <div className="eq-curtain size-full bg-surface" />
      </div>
    </div>
  )
}
