/**
 * «Лента» над графиками: одна панель с тонкими разделителями.
 * Реализованный PnL (крупно, со счётчиком, колонкой цифр и мини-кривой) + Винрейт + Profit factor + Средний R.
 * Мини-кривая — свой лёгкий SVG (без Recharts): ломаная по сделкам, участок максимальной просадки — цветом убытка.
 */
import { useId, useMemo, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { fmt, useT } from '@/i18n'
import { formatNumber, formatPercent, formatPnl, formatR, formatRatio, formatUsd, pnlClass } from '@/lib/format'
import { downsampleEquity, type DrawdownPeriod, type EquityPoint, type Summary } from '@/lib/calc/stats'
import { useCountUp } from '@/lib/motion'
import { daysBetween, longDate, shortDate, withPoints, withTime } from './equityTime'

type Props = {
  summary: Summary
  /** полная кривая (по точке на сделку) */
  curve: EquityPoint[]
  period: DrawdownPeriod | null
  startingBalance: number | null
  rwl: { avgWinR: number | null; avgLossR: number | null }
}

export function SummaryStrip({ summary: s, curve, period, startingBalance, rwl }: Props) {
  const t = useT()
  const k = t.dashboard.kpi
  const toDeposit = startingBalance ? `${fmt(k.toDeposit, { p: signedPercent(s.totalPnl / startingBalance) })} · ` : ''

  // длительность максимальной просадки: от пика до восстановления (или до последней сделки)
  const ddDays = useMemo(() => {
    if (!period) return null
    const tp = withTime(curve)
    return daysBetween(tp[period.peak].t, tp[period.recovery ?? tp.length - 1].t)
  }, [curve, period])
  const ddValue = s.maxDrawdown <= 0 ? '—' : s.maxDrawdownPct !== null ? `−${formatPercent(s.maxDrawdownPct)}` : `−${formatUsd(s.maxDrawdown)}`

  const grossWin = (s.avgWin ?? 0) * s.wins
  const grossLoss = -(s.avgLoss ?? 0) * s.losses

  return (
    <section className="rise grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-3 xl:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
      {/* Реализованный PnL */}
      <div className="col-span-2 flex min-w-0 flex-col gap-4 bg-surface p-4 sm:p-5 md:col-span-3 xl:col-span-1">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <div className="text-xs text-muted">{k.totalPnl}</div>
            <div className={`num mt-1 truncate text-[28px] leading-tight font-semibold sm:text-3xl ${pnlClass(s.totalPnl)}`}>
              <CountPnl value={s.totalPnl} />
            </div>
            <div className="mt-1 text-xs text-muted">
              {toDeposit}
              {fmt(k.trades, { n: s.closed })}
            </div>
          </div>
          <dl className="grid w-full gap-1.5 border-border text-xs sm:w-auto sm:min-w-[220px] sm:border-l sm:pl-4">
            <Fact label={k.expectancy} value={formatPnl(s.expectancy)} tone={pnlClass(s.expectancy)} />
            <Fact label={k.bestTrade} value={formatPnl(s.best)} tone={pnlClass(s.best)} />
            <Fact label={k.worstTrade} value={formatPnl(s.worst)} tone={pnlClass(s.worst)} />
            <Fact label={k.maxDrawdown} value={ddValue} tone={s.maxDrawdown > 0 ? 'text-loss' : ''} />
            {ddDays !== null && period && (
              <Fact label={period.recovery !== null ? k.recoveredIn : k.lasting} value={fmt(k.days, { n: ddDays })} />
            )}
          </dl>
        </div>
        <MiniEquity curve={curve} period={period} />
      </div>

      {/* Винрейт */}
      <Cell label={k.winrate} value={formatPercent(s.winrate)}>
        <SplitBar a={s.wins} b={s.losses} />
        <span className="text-xs text-muted">{fmt(k.winLoss, { w: s.wins, l: s.losses })}</span>
      </Cell>

      {/* Profit factor */}
      <Cell label={k.profitFactor} value={formatRatio(s.profitFactor)}>
        <SplitBar a={grossWin} b={grossLoss} />
        <span className="text-xs text-muted">{k.profitFactorHint}</span>
      </Cell>

      {/* Средний R: средний выигрыш против среднего проигрыша */}
      <Cell label={k.avgR} value={formatR(s.avgR)} tone={pnlClass(s.avgR)} className="col-span-2 md:col-span-1">
        {s.rCount === 0 ? (
          <span className="text-xs text-muted">{k.avgRNone}</span>
        ) : (
          <>
            <WinLossR win={rwl.avgWinR} loss={rwl.avgLossR} />
            <span className="text-xs text-muted">
              {ratioText(rwl.avgWinR, rwl.avgLossR, t)} · {fmt(k.avgRHint, { n: s.rCount })}
            </span>
          </>
        )}
      </Cell>
    </section>
  )
}

function CountPnl({ value }: { value: number }) {
  return <>{formatPnl(useCountUp(value))}</>
}

function Fact({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className={`num text-[13px] font-semibold ${tone}`}>{value}</dd>
    </div>
  )
}

function Cell({ label, value, tone = '', className = '', children }: { label: string; value: string; tone?: string; className?: string; children: ReactNode }) {
  return (
    <div className={`flex min-w-0 flex-col gap-2.5 bg-surface p-4 sm:p-5 ${className}`}>
      <div className="text-xs text-muted">{label}</div>
      <div className={`num truncate text-[22px] leading-tight font-semibold ${tone}`}>{value}</div>
      {children}
    </div>
  )
}

/** Полоска «плюс / минус»: доли — длиной частей */
function SplitBar({ a, b }: { a: number; b: number }) {
  if (a + b <= 0) return <div className="h-2 rounded-full bg-surface-2" aria-hidden />
  return (
    <div className="flex h-2 gap-0.5" aria-hidden>
      {a > 0 && <i className="block rounded-full bg-profit" style={{ flex: a }} />}
      {b > 0 && <i className="block rounded-full bg-loss" style={{ flex: b }} />}
    </div>
  )
}

function WinLossR({ win, loss }: { win: number | null; loss: number | null }) {
  const t = useT()
  const max = Math.max(win ?? 0, -(loss ?? 0)) || 1
  const row = (label: string, v: number | null, bar: string) => (
    <div className="grid grid-cols-[84px_minmax(0,1fr)_auto] items-center gap-2.5 text-xs text-muted">
      <span>{label}</span>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <i className={`block h-full rounded-full ${bar}`} style={{ width: `${(Math.abs(v ?? 0) / max) * 100}%` }} />
      </div>
      <b className={`num min-w-14 text-right text-[13px] font-semibold ${pnlClass(v)}`}>{formatR(v)}</b>
    </div>
  )
  return (
    <div className="grid gap-2">
      {row(t.dashboard.kpi.avgWinR, win, 'bg-profit')}
      {row(t.dashboard.kpi.avgLossR, loss, 'bg-loss')}
    </div>
  )
}

function ratioText(win: number | null, loss: number | null, t: ReturnType<typeof useT>): string {
  if (win === null || loss === null || loss === 0) return ''
  const x = win / -loss
  return x >= 1 ? fmt(t.dashboard.kpi.rRatio, { x: formatNumber(x, 1) }) : fmt(t.dashboard.kpi.rRatioLess, { x: formatNumber(x, 2) })
}

function signedPercent(fraction: number): string {
  const s = formatPercent(Math.abs(fraction))
  return fraction > 0 ? `+${s}` : fraction < 0 ? `−${s}` : s
}

/* ---------- Мини-кривая ---------- */

const W = 300
const H = 72

function MiniEquity({ curve, period }: { curve: EquityPoint[]; period: DrawdownPeriod | null }) {
  const t = useT()
  const gid = useId()
  const [hover, setHover] = useState<number | null>(null)

  const g = useMemo(() => {
    // для мини-графика хватает ~200 точек; пик и дно просадки — всегда на месте
    const keep = period ? [period.peak, period.trough] : []
    const pts = withTime(withPoints(downsampleEquity(curve, 200), curve, keep))
    if (pts.length < 2) return null
    const t0 = pts[0].t
    const span = pts[pts.length - 1].t - t0 || 1
    const cums = pts.map((p) => p.cum)
    const lo = Math.min(0, ...cums)
    const hi = Math.max(0, ...cums)
    const X = (ms: number) => ((ms - t0) / span) * W
    const Y = (v: number) => 4 + (1 - (v - lo) / (hi - lo || 1)) * (H - 8)
    const xy = pts.map((p) => [X(p.t), Y(p.cum)] as const)
    const path = (from: number, to: number) => xy.slice(from, to + 1).map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join('')
    const line = path(0, xy.length - 1)
    const pk = period ? pts.findIndex((p) => p.n === period.peak) : -1
    const tr = period ? pts.findIndex((p) => p.n === period.trough) : -1
    return {
      pts,
      xy,
      line,
      area: `${line}L${xy[xy.length - 1][0]} ${H}L0 ${H}Z`,
      zeroY: Y(0),
      dd: pk >= 0 && tr > pk ? path(pk, tr) : null,
      trough: tr >= 0 ? xy[tr] : null,
      ticks: [0, 0.25, 0.5, 0.75, 1].map((f) => t0 + f * span),
    }
  }, [curve, period])

  if (!g) return null
  const pct = (x: number) => `${(x / W) * 100}%`
  const top = (y: number) => `${(y / H) * 100}%`
  const last = g.xy[g.xy.length - 1]

  function onMove(e: PointerEvent<HTMLDivElement>) {
    if (!g) return
    const r = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * W
    let best = 0
    g.xy.forEach(([px], i) => {
      if (Math.abs(px - x) < Math.abs(g.xy[best][0] - x)) best = i
    })
    setHover(best)
  }

  const hp = hover !== null ? g.pts[hover] : null
  const hxy = hover !== null ? g.xy[hover] : null

  return (
    <div>
      <div className="relative cursor-crosshair" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="reveal block h-[72px] w-full" aria-hidden>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: 'var(--color-accent)', stopOpacity: 0.24 }} />
              <stop offset="1" style={{ stopColor: 'var(--color-accent)', stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          <path d={g.area} fill={`url(#${gid})`} />
          <line x1={0} x2={W} y1={g.zeroY} y2={g.zeroY} stroke="var(--color-border)" vectorEffect="non-scaling-stroke" />
          <path d={g.line} fill="none" stroke="var(--color-accent)" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {g.dd && <path d={g.dd} fill="none" stroke="var(--color-loss)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
        </svg>
        {g.trough && <Dot x={pct(g.trough[0])} y={top(g.trough[1])} className="bg-loss" delay=".7s" />}
        <Dot x={pct(last[0])} y={top(last[1])} className="bg-accent" delay="1.05s" />
        {hp && hxy && (
          <>
            <i className="pointer-events-none absolute inset-y-0 w-px bg-muted/50" style={{ left: pct(hxy[0]) }} />
            <i className="pointer-events-none absolute size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_0_2px_var(--color-surface)]" style={{ left: pct(hxy[0]), top: top(hxy[1]) }} />
            <div
              className={`pointer-events-none absolute top-0 z-10 rounded-lg border border-border bg-surface-2 px-2 py-1 whitespace-nowrap shadow-lg ${hxy[0] > W / 2 ? '-translate-x-[calc(100%+8px)]' : 'translate-x-2'}`}
              style={{ left: pct(hxy[0]) }}
            >
              <div className="text-[10px] text-muted">{hp.n === 0 ? t.dashboard.charts.start : longDate(hp.t)}</div>
              <div className="num text-xs font-semibold">{formatPnl(hp.cum)}</div>
              {hp.n > 0 && (
                <div className={`num text-[11px] ${pnlClass(hp.pnl)}`}>
                  {hp.symbol} {formatPnl(hp.pnl)}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      <div className="num relative mt-1.5 h-4 text-[11px] text-muted" aria-hidden>
        {g.ticks.map((ms, i) => (
          <span
            key={i}
            className={`absolute whitespace-nowrap ${i === 0 ? '' : i === g.ticks.length - 1 ? '-translate-x-full' : '-translate-x-1/2'}`}
            style={{ left: `${i * 25}%` }}
          >
            {shortDate(ms)}
          </span>
        ))}
      </div>
    </div>
  )
}

function Dot({ x, y, className, delay }: { x: string; y: string; className: string; delay: string }) {
  return (
    <i
      className={`pop pointer-events-none absolute size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_0_2px_var(--color-surface)] ${className}`}
      style={{ left: x, top: y, '--d': delay } as CSSProperties}
    />
  )
}
