/**
 * Первый вход: сделок ещё нет. Слева — три шага, как начать; справа — «живой» пример статистики:
 * выдуманные сделки приходят по одной, кривая капитала дорисовывается, показатели пересчитываются.
 * Анимация — один requestAnimationFrame (плавно на любом компьютере), вне экрана не считается;
 * при «уменьшить движение» сразу показываем готовый пример.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { fmt, useT } from '@/i18n'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { formatDayShort, formatPercent, formatPnl, formatRatio, formatUsd, formatUsdShort, pnlClass } from '@/lib/format'
import { prefersReducedMotion } from '@/lib/motion'
import { demoAccount } from '@/features/landing/demo'
import type { ClosedTrade } from '@/lib/calc/stats'
import { big, Counts, HalfGauge, Ring, Widget } from './Widgets'

export function Welcome() {
  const trades = useMemo(() => demoAccount().trades, [])
  return (
    <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[400px_minmax(0,1fr)] lg:items-start">
      <StartSteps />
      <LiveExample trades={trades} />
    </div>
  )
}

/* ───────── Слева: три шага ───────── */

function StartSteps() {
  const t = useT()
  const w = t.dashboard.welcome
  const navigate = useNavigate()
  const steps = [
    {
      ...w.steps.connect,
      actions: (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => navigate('/import#connections')}>{w.paths.api}</Button>
          <Button variant="secondary" onClick={() => navigate('/import')}>
            {w.paths.file}
          </Button>
          <Button variant="ghost" className="!px-2" onClick={() => navigate('/trades/new')}>
            {w.paths.manual}
          </Button>
        </div>
      ),
    },
    {
      ...w.steps.balance,
      actions: (
        <div className="mt-3">
          <Button variant="secondary" onClick={() => navigate('/settings')}>
            {w.settings}
          </Button>
        </div>
      ),
    },
    { ...w.steps.review, actions: null },
  ]
  return (
    <Card className="rise !p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">{w.start}</h2>
        <span className="text-xs text-muted">{fmt(w.stepsDone, { n: 1 })}</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full w-1/3 rounded-full bg-primary" />
      </div>
      <ol className="mt-5 flex flex-col">
        {steps.map((s, i) => (
          <li key={s.title} className="relative flex gap-3.5 pb-6 last:pb-0">
            {i < steps.length - 1 && <span aria-hidden className="absolute top-9 bottom-1 left-[13px] w-px bg-border" />}
            <span
              className={`num flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${i === 0 ? 'bg-primary text-on-primary' : 'border border-border bg-surface-2 text-muted'}`}
            >
              {i + 1}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="font-semibold">{s.title}</p>
              <p className="mt-0.5 text-sm text-text/80">{s.text}</p>
              {s.actions}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  )
}

/* ───────── Справа: живой пример ───────── */

const PER_TRADE = 750 // мс на одну сделку
const HOLD = 3000 // пауза на готовом примере перед повтором
const START = 3 // сразу видно несколько сделок, а не пустой график

/**
 * Позиция примера: сколько сделок «пришло» (дробное — следующая в пути).
 * Внутри каждой сделки движение с замедлением: быстро прилетает и мягко встаёт на место.
 */
function useDemoPosition(total: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState(() => (prefersReducedMotion() ? total : START))
  useEffect(() => {
    if (prefersReducedMotion()) return
    let visible = true
    const io = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([e]) => (visible = e.isIntersecting))
    if (io && ref.current) io.observe(ref.current)
    const run = (total - START) * PER_TRADE
    let start = -1
    let frame = 0
    const tick = (now: number) => {
      if (start < 0) start = now
      if (visible) {
        const el = (now - start) % (run + HOLD)
        const raw = START + Math.min(run, el) / PER_TRADE
        const k = Math.floor(raw)
        const f = Math.min(1, (raw - k) * 1.5) // сделка «доезжает» за первые 2/3 своего времени
        setPos(k >= total ? total : k + (1 - Math.pow(1 - f, 3)))
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      io?.disconnect()
    }
  }, [total])
  return { ref, pos }
}

function LiveExample({ trades }: { trades: ClosedTrade[] }) {
  const t = useT()
  const w = t.dashboard.welcome
  const k = t.dashboard.kpi
  const { ref, pos } = useDemoPosition(trades.length)

  const cum = useMemo(() => {
    let c = 0
    return [0, ...trades.map((tr) => (c += tr.pnl))]
  }, [trades])

  // показатели на текущий момент: пришедшие сделки целиком + следующая на долю пути (числа меняются плавно)
  const n = Math.floor(pos)
  const e = pos - n
  const s = useMemo(() => {
    let wins = 0
    let losses = 0
    let gw = 0
    let gl = 0
    for (let i = 0; i < n; i++) {
      const p = trades[i].pnl
      if (p > 0) (wins++, (gw += p))
      else if (p < 0) (losses++, (gl -= p))
    }
    return { wins, losses, gw, gl }
  }, [trades, n])
  const next = trades[n]
  const wins = s.wins + (next && next.pnl > 0 ? e : 0)
  const losses = s.losses + (next && next.pnl < 0 ? e : 0)
  const gw = s.gw + (next && next.pnl > 0 ? next.pnl * e : 0)
  const gl = s.gl + (next && next.pnl < 0 ? -next.pnl * e : 0)
  const pnl = cum[n] + (next ? (cum[n + 1] - cum[n]) * e : 0)
  const count = Math.min(trades.length, Math.round(pos))

  return (
    <div ref={ref} className="relative">
      <span className="absolute -top-2.5 left-4 z-10 rounded-md border border-border bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted">{w.example}</span>
      <div inert className="flex select-none flex-col gap-3 rounded-xl border border-dashed border-border p-3 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 pt-1">
          <div className="min-w-0">
            <h2 className="font-semibold">{w.liveTitle}</h2>
            <p className="mt-0.5 text-xs text-muted">{w.liveHint}</p>
          </div>
          <span className="num flex shrink-0 items-center gap-2 rounded-md bg-surface-2 px-2 py-1 text-xs text-muted">
            <span className="size-1.5 rounded-full bg-primary" />
            {w.sync}
            <span className="text-text">
              {count}/{trades.length}
            </span>
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <Widget
            label={k.totalPnl}
            hint={k.hints.totalPnl}
            className="col-span-2 md:col-span-1"
            aside={<span className="num shrink-0 rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted">{fmt(k.trades, { n: count })}</span>}
          >
            <div className={`${big} text-[30px]`}>{formatPnl(pnl)}</div>
          </Widget>
          <Widget label={k.tradeWinrate} hint={k.hints.tradeWinrate}>
            <div className="flex flex-col-reverse items-start gap-2 min-[420px]:flex-row min-[420px]:items-end min-[420px]:justify-between">
              <div className={big}>{formatPercent(wins + losses ? wins / (wins + losses) : null, 0)}</div>
              <HalfGauge a={wins} b={losses} live />
            </div>
            <Counts a={Math.round(wins)} b={Math.round(losses)} />
          </Widget>
          <Widget label={k.profitFactor} hint={k.hints.profitFactor}>
            <div className="flex items-center justify-between gap-2">
              <div className={big}>{formatRatio(gl > 0 ? gw / gl : null)}</div>
              <Ring a={gw} b={gl} live />
            </div>
            <div className="num flex justify-between gap-2 text-xs">
              <span>{formatUsd(gw)}</span>
              <span className="text-muted">−{formatUsd(gl)}</span>
            </div>
          </Widget>
        </div>

        <div className="grid gap-3 2xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <section className="rounded-lg border border-border bg-surface p-4">
            <h3 className="font-semibold">{t.dashboard.charts.equity}</h3>
            <p className="mt-0.5 text-xs text-muted">{t.dashboard.charts.equityHintUsd}</p>
            <LiveCurve cum={cum} trades={trades} pos={pos} />
          </section>
          <section className="rounded-lg border border-border bg-surface p-4">
            <h3 className="font-semibold">{w.recent}</h3>
            <RecentTrades trades={trades} pos={pos} />
          </section>
        </div>
      </div>
    </div>
  )
}

/** Ширина элемента в пикселях — график рисуем в настоящих пикселях: точка круглая, подписи не растянуты */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setW(el.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, w }
}

/** Плавная кривая через точки (как type="monotone" у настоящего графика, только проще) */
function smoothPath(pts: [number, number][]): string {
  if (!pts.length) return ''
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += `C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`
  }
  return d
}

/** Кривая капитала примера в стиле настоящей: фиолетовая линия, мягкая заливка, пунктир нуля, точка с суммой на конце */
function LiveCurve({ cum, trades, pos }: { cum: number[]; trades: ClosedTrade[]; pos: number }) {
  const { ref, w: W } = useWidth<HTMLDivElement>()
  const id = useId().replace(/:/g, '')
  const H = 240
  const L = 52 // место под подписи оси Y
  const R = W >= 480 ? 96 : 16 // место под сумму у последней точки
  const T = 22
  const B = 24 // подписи дат

  const { lo, hi, ticks } = useMemo(() => {
    const min = Math.min(...cum)
    const max = Math.max(...cum)
    const step = niceStep((max - min) / 4)
    const lo = Math.floor(min / step) * step
    const hi = Math.ceil(max / step) * step
    const ticks: number[] = []
    for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(v)
    return { lo, hi, ticks }
  }, [cum])

  if (W === 0) return <div ref={ref} className="mt-3" style={{ height: H }} />

  const x = (i: number) => L + (i / (cum.length - 1)) * (W - L - R)
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B)
  const n = Math.floor(pos)
  const e = pos - n
  const endV = n + 1 < cum.length ? cum[n] + (cum[n + 1] - cum[n]) * e : cum[n]
  const pts: [number, number][] = cum.slice(0, n + 1).map((v, i) => [x(i), y(v)])
  if (n + 1 < cum.length && e > 0) pts.push([x(n + e), y(endV)])
  const [ex, ey] = pts[pts.length - 1]
  const line = smoothPath(pts)
  const area = `${line}L${ex.toFixed(1)} ${H - B}L${L} ${H - B}Z`
  // только что пришедшая сделка: её сумма всплывает над точкой и тает
  const fresh = trades[n - 1]
  const fade = n < trades.length ? e : 1
  const labels = [0, 0.25, 0.5, 0.75, 1].map((k) => Math.round(k * (trades.length - 1)))

  return (
    <div ref={ref} className="mt-3">
      <svg width={W} height={H} className="block overflow-visible" aria-hidden>
        <defs>
          <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
            <stop offset={0} stopColor="var(--color-primary)" stopOpacity={0.26} />
            <stop offset={1} stopColor="var(--color-primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--color-border)" />
            <text x={L - 8} y={y(v)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--color-muted)">
              {formatUsdShort(v)}
            </text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="var(--color-muted)" strokeOpacity={0.45} strokeDasharray="4 4" />
        {labels.map((i) => (
          <text key={i} x={x(i + 1)} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--color-muted)">
            {formatDayShort(trades[i].exit_at.slice(0, 10))}
          </text>
        ))}
        <path d={area} fill={`url(#${id}f)`} />
        <path d={line} fill="none" stroke="var(--color-primary)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {fresh && fade < 1 && (
          <text
            x={ex}
            y={ey - 22 - fade * 18}
            textAnchor="middle"
            fontSize={12}
            fontWeight={600}
            opacity={1 - fade}
            fill={fresh.pnl >= 0 ? 'var(--color-primary)' : 'var(--color-muted)'}
          >
            {formatPnl(fresh.pnl)}
          </text>
        )}
        <circle cx={ex} cy={ey} r={4.5} fill="var(--color-primary)" stroke="var(--color-surface)" strokeWidth={2} />
        {R > 16 && (
          <text x={ex + 10} y={ey} dy="0.32em" fontSize={12} fontWeight={600} fill="var(--color-text)">
            {formatPnl(endV)}
          </text>
        )}
      </svg>
    </div>
  )
}

/** «Круглый» шаг сетки: 1, 2, 2.5, 5 × 10ⁿ */
function niceStep(raw: number): number {
  if (!(raw > 0)) return 1
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  const m = raw / p
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p
}

const ROW = 44 // высота строки списка, px
const ROWS = 5

/** Последние сделки, как в списке «Сделки»: новая въезжает сверху, остальные плавно сдвигаются вниз */
function RecentTrades({ trades, pos }: { trades: ClosedTrade[]; pos: number }) {
  const t = useT()
  const n = Math.floor(pos)
  const e = pos - n
  const arriving = n < trades.length && e > 0
  const top = arriving ? n : n - 1 // индекс самой новой строки
  const rows = []
  for (let i = top; i >= 0 && i > top - ROWS - 1; i--) rows.push(trades[i])
  const shift = arriving ? (1 - e) * ROW : 0
  return (
    <div className="relative mt-3 overflow-hidden" style={{ height: ROW * ROWS }}>
      <ul style={{ transform: `translateY(${-shift}px)` }}>
        {rows.map((tr, j) => (
          <li
            key={tr.id}
            style={{ height: ROW, opacity: j === 0 && arriving ? e : 1 }}
            className={`flex items-center justify-between gap-3 border-b border-border px-1 text-sm last:border-0 ${j === 0 ? 'font-medium' : ''}`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="num w-11 shrink-0 text-xs text-muted">{formatDayShort(tr.exit_at.slice(0, 10))}</span>
              <span className="truncate font-medium">{tr.symbol}</span>
              <span
                className={`rounded px-1.5 py-0.5 text-[11px] font-bold tracking-wide uppercase ${tr.side === 'long' ? 'bg-profit/15 text-profit' : 'bg-loss/15 text-loss'}`}
              >
                {t.side[tr.side]}
              </span>
            </span>
            <span className={`num shrink-0 font-semibold ${pnlClass(tr.pnl)}`}>{formatPnl(tr.pnl)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
