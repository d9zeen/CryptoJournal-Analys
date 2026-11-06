/**
 * Виджеты дашборда в духе TradeZella: верхний ряд показателей со шкалами (полукруг, кольцо, полоска),
 * «Оценка трейдера» (радар + итог 0…100) и «Ключевые цифры».
 * Шкалы — свой лёгкий SVG (pathLength = 100), при первом показе плавно заполняются.
 */
import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react'
import { fmt, useT } from '@/i18n'
import { formatNumber, formatPercent, formatPnl, formatR, formatRatio, formatUsd, pnlClass } from '@/lib/format'
import type { DrawdownPeriod, EquityPoint, Summary } from '@/lib/calc/stats'
import { SCORE_MIN_TRADES, type TraderScore } from '@/lib/calc/score'
import { prefersReducedMotion, useCountUp } from '@/lib/motion'
import { daysBetween, withTime } from './equityTime'
import { previewVariant } from '@/lib/designPreview'

/* ВРЕМЕННО: варианты «Ключевых цифр» для выбора владельцем (см. lib/designPreview.ts) */
const KEYS = previewVariant('keys')

/** Цвета шкал — в тон кривой капитала (выбор владельца 06.11.2026): выигрыш фиолетовый, проигрыш приглушённый */
const TONE = { aStroke: 'stroke-primary', bStroke: 'stroke-muted/40', aBg: 'bg-primary', bBg: 'bg-muted/40', aPill: 'bg-primary/15 text-primary', bPill: 'bg-surface-2 text-muted', aText: 'text-text', bText: 'text-muted' }

/** Мини-кривая капитала в карточке PnL: фиолетовая линия с мягкой заливкой, как большая кривая */
function Sparkline({ points }: { points: EquityPoint[] }) {
  if (points.length < 2) return null
  const W = 120
  const H = 36
  const vs = points.map((p) => p.cum)
  const lo = Math.min(...vs)
  const hi = Math.max(...vs)
  const x = (i: number) => (i / (points.length - 1)) * W
  const y = (v: number) => 2 + (1 - (v - lo) / (hi - lo || 1)) * (H - 4)
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.cum).toFixed(1)}`).join('')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-8 w-full overflow-visible" aria-hidden>
      <path d={`${line}L${W} ${H}L0 ${H}Z`} className="fill-primary/15" />
      <path d={line} fill="none" className="stroke-primary" strokeWidth={1.75} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

const ScoreRadar = lazy(() => import('./charts').then((m) => ({ default: m.ScoreRadar })))

/** false на первом кадре, потом true — чтобы шкалы «доросли» до значения (без анимации — сразу true) */
function useShown(): boolean {
  const [shown, setShown] = useState(prefersReducedMotion)
  useEffect(() => {
    if (shown) return
    const f = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
    return () => cancelAnimationFrame(f)
  }, [shown])
  return shown
}

const grow = 'transition-[stroke-dasharray,stroke-dashoffset] duration-[900ms] ease-out motion-reduce:transition-none'

/* ---------- Шкалы ---------- */

/** Полукруг: доля a (прибыль) слева, доля b (убыток) справа, между ними — зазор */
function HalfGauge({ a, b }: { a: number; b: number }) {
  const shown = useShown()
  const sum = a + b
  const gap = a > 0 && b > 0 ? 3 : 0
  const pa = sum > 0 ? (a / sum) * (100 - gap) : 0
  const pb = sum > 0 ? (b / sum) * (100 - gap) : 0
  const d = 'M8 46 A38 38 0 0 1 84 46'
  return (
    <svg viewBox="0 0 92 50" className="h-[36px] w-[66px] shrink-0 sm:h-[46px] sm:w-[84px]" aria-hidden>
      <path d={d} pathLength={100} fill="none" className="stroke-surface-2" strokeWidth={8} strokeLinecap="round" />
      {pa > 0 && (
        <path d={d} pathLength={100} fill="none" className={`${TONE.aStroke} ${grow}`} strokeWidth={8} strokeLinecap="round" strokeDasharray={`${shown ? pa : 0} 100`} />
      )}
      {pb > 0 && (
        <path
          d={d}
          pathLength={100}
          fill="none"
          className={`${TONE.bStroke} ${grow}`}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={`${shown ? pb : 0} 100`}
          strokeDashoffset={-(100 - (shown ? pb : 0))}
        />
      )}
    </svg>
  )
}

/** Кольцо: прибыль и убытки по кругу */
function Ring({ a, b }: { a: number; b: number }) {
  const shown = useShown()
  const sum = a + b
  const gap = a > 0 && b > 0 ? 4 : 0
  const pa = sum > 0 ? (a / sum) * (100 - gap * 2) : 0
  const pb = sum > 0 ? (b / sum) * (100 - gap * 2) : 0
  const c = { cx: 26, cy: 26, r: 21, pathLength: 100, fill: 'none', strokeWidth: 7 }
  return (
    <svg viewBox="0 0 52 52" className="size-[44px] shrink-0 -rotate-90 sm:size-[52px]" aria-hidden>
      <circle {...c} className="stroke-surface-2" />
      {pa > 0 && <circle {...c} className={`${TONE.aStroke} ${grow}`} strokeLinecap="round" strokeDasharray={`${shown ? pa : 0} 100`} />}
      {pb > 0 && (
        <circle {...c} className={`${TONE.bStroke} ${grow}`} strokeLinecap="round" strokeDasharray={`${shown ? pb : 0} 100`} strokeDashoffset={-(pa + gap)} />
      )}
    </svg>
  )
}

/** Две полоски: средний выигрыш и средний проигрыш, длина — относительно большего */
function PairBars({ win, loss }: { win: number; loss: number }) {
  const shown = useShown()
  const max = Math.max(win, loss) || 1
  const bar = (v: number, cls: string) => (
    <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
      <i className={`block h-full rounded-full ${cls} transition-[width] duration-[900ms] ease-out`} style={{ width: shown ? `${(v / max) * 100}%` : 0 }} />
    </div>
  )
  return (
    <div className="grid w-full gap-1.5">
      {bar(win, TONE.aBg)}
      {bar(loss, TONE.bBg)}
    </div>
  )
}

/* ---------- Верхний ряд ---------- */

function Widget({ label, hint, aside, children, className = '' }: { label: string; hint: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card-lift flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-4 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-xs font-medium text-muted">
          {label}
          <span title={hint} aria-label={hint} className="inline-flex size-3.5 cursor-help items-center justify-center rounded-full border border-current text-[9px] leading-none opacity-70">
            i
          </span>
        </h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

const big = 'num min-w-0 truncate text-xl leading-tight font-semibold sm:text-2xl'

export function KpiRow({ summary: s, score, startingBalance, equity = [] }: { summary: Summary; score: TraderScore; startingBalance: number | null; equity?: EquityPoint[] }) {
  const t = useT()
  const k = t.dashboard.kpi
  const grossWin = (s.avgWin ?? 0) * s.wins
  const grossLoss = -(s.avgLoss ?? 0) * s.losses
  const pnl = useCountUp(s.totalPnl)
  const ratio = s.avgWin !== null && s.avgLoss !== null && s.avgLoss < 0 ? s.avgWin / -s.avgLoss : null
  const toDeposit = startingBalance ? fmt(k.toDeposit, { p: signedPercent(s.totalPnl / startingBalance) }) : null

  return (
    <div data-shot="kpi" className="rise grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-[minmax(0,1.35fr)_repeat(4,minmax(0,1fr))]">
      <Widget
        label={k.totalPnl}
        hint={k.hints.totalPnl}
        className="col-span-2 md:col-span-4 xl:col-span-1"
        aside={<span className="num shrink-0 rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted">{fmt(k.trades, { n: s.closed })}</span>}
      >
        <div>
          <div className={`${big} text-[30px]`}>{formatPnl(pnl)}</div>
          {toDeposit && <p className="mt-0.5 text-xs text-muted">{toDeposit}</p>}
        </div>
        <Sparkline points={equity} />
      </Widget>

      <Widget label={k.tradeWinrate} hint={k.hints.tradeWinrate}>
        <div className="flex flex-col-reverse items-start gap-2 min-[420px]:flex-row min-[420px]:items-end min-[420px]:justify-between">
          <div className={big}>{formatPercent(s.winrate)}</div>
          <HalfGauge a={s.wins} b={s.losses} />
        </div>
        <Counts a={s.wins} b={s.losses} />
      </Widget>

      <Widget label={k.profitFactor} hint={k.hints.profitFactor}>
        <div className="flex items-center justify-between gap-2">
          <div className={big}>{formatRatio(s.profitFactor)}</div>
          <Ring a={grossWin} b={grossLoss} />
        </div>
        <div className="num flex justify-between gap-2 text-xs">
          <span className={TONE.aText}>{formatUsd(grossWin)}</span>
          <span className={TONE.bText}>−{formatUsd(grossLoss)}</span>
        </div>
      </Widget>

      <Widget label={k.dayWinrate} hint={k.hints.dayWinrate}>
        <div className="flex flex-col-reverse items-start gap-2 min-[420px]:flex-row min-[420px]:items-end min-[420px]:justify-between">
          <div className={big}>{formatPercent(score.dayWinrate)}</div>
          <HalfGauge a={score.dayWins} b={score.dayLosses} />
        </div>
        <Counts a={score.dayWins} b={score.dayLosses} />
      </Widget>

      <Widget label={k.avgWinLoss} hint={k.hints.avgWinLoss}>
        <div className={big}>{ratio === null ? '—' : formatNumber(ratio, 2)}</div>
        <PairBars win={s.avgWin ?? 0} loss={-(s.avgLoss ?? 0)} />
        <div className="num flex justify-between gap-2 text-xs">
          <span className={TONE.aText}>{formatPnl(s.avgWin)}</span>
          <span className={TONE.bText}>{formatPnl(s.avgLoss)}</span>
        </div>
      </Widget>
    </div>
  )
}

/** «Таблетки» с количеством под шкалой (в прибыль / в убыток) */
function Counts({ a, b }: { a: number; b: number }) {
  return (
    <div className="num flex gap-1.5 text-xs font-semibold">
      <span className={`rounded-md px-1.5 py-0.5 ${TONE.aPill}`}>{a}</span>
      <span className={`rounded-md px-1.5 py-0.5 ${TONE.bPill}`}>{b}</span>
    </div>
  )
}

/* ---------- Оценка трейдера ---------- */

export function ScoreCard({ score, trades }: { score: TraderScore; trades: number }) {
  const t = useT()
  const sc = t.dashboard.score
  const shown = useShown()
  const total = useCountUp(score.total)
  const tone = 'bg-primary' // в тон кривой и шкал (раньше — зелёный / жёлтый / красный по уровню)
  const data = score.parts.map((p) => ({ name: sc.parts[p.key], score: p.score }))
  return (
    <section className="rise card-lift flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 [--i:1]">
      <div>
        <h2 className="font-semibold">{sc.title}</h2>
        <p className="mt-0.5 text-xs text-muted">{sc.hint}</p>
      </div>
      <Suspense fallback={<div className="h-[220px]" />}>
        <ScoreRadar data={data} />
      </Suspense>
      <div className="flex items-end justify-between gap-3">
        <div className="num text-4xl leading-none font-semibold">{Math.round(total)}</div>
        <div className="text-xs text-muted">{sc.outOf}</div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <i className={`block h-full rounded-full ${tone} transition-[width] duration-[900ms] ease-out`} style={{ width: shown ? `${score.total}%` : 0 }} />
      </div>
      <ul className="grid gap-1 text-xs">
        {score.parts.map((p) => (
          <li key={p.key} className="flex items-baseline justify-between gap-3" title={sc.explain[p.key]}>
            <span className="text-muted">{sc.parts[p.key]}</span>
            <span className="num font-semibold">{p.score}</span>
          </li>
        ))}
      </ul>
      {trades < SCORE_MIN_TRADES && <p className="text-xs text-warning">{fmt(sc.few, { n: SCORE_MIN_TRADES })}</p>}
    </section>
  )
}

/* ---------- Ключевые цифры ---------- */

export function KeyNumbers({
  summary: s,
  curve,
  period,
  rwl,
}: {
  summary: Summary
  curve: EquityPoint[]
  period: DrawdownPeriod | null
  rwl: { avgWinR: number | null; avgLossR: number | null }
}) {
  const t = useT()
  const k = t.dashboard.kpi
  // длительность максимальной просадки: от пика до восстановления (или до последней сделки)
  const ddDays = useMemo(() => {
    if (!period) return null
    const tp = withTime(curve)
    return daysBetween(tp[period.peak].t, tp[period.recovery ?? tp.length - 1].t)
  }, [curve, period])
  const ddValue = s.maxDrawdown <= 0 ? '—' : s.maxDrawdownPct !== null ? `−${formatPercent(s.maxDrawdownPct)}` : `−${formatUsd(s.maxDrawdown)}`
  const rows: [string, string, string][] = [
    [k.expectancy, formatPnl(s.expectancy), pnlClass(s.expectancy)],
    [k.bestTrade, formatPnl(s.best), pnlClass(s.best)],
    [k.worstTrade, formatPnl(s.worst), pnlClass(s.worst)],
    [k.maxDrawdown, ddValue, s.maxDrawdown > 0 ? 'text-loss' : ''],
  ]
  if (ddDays !== null && period) rows.push([period.recovery !== null ? k.recoveredIn : k.lasting, fmt(k.days, { n: ddDays }), ''])
  rows.push([k.avgR, s.rCount ? formatR(s.avgR) : '—', pnlClass(s.avgR)])
  if (s.rCount) {
    rows.push([k.avgWinR, formatR(rwl.avgWinR), pnlClass(rwl.avgWinR)])
    rows.push([k.avgLossR, formatR(rwl.avgLossR), pnlClass(rwl.avgLossR)])
  }
  if (KEYS === 'd') return <KeysDiverging summary={s} rwl={rwl} ddValue={ddValue} ddDays={ddDays} recovered={period?.recovery !== null} />
  if (KEYS === 'e') return <KeysReport summary={s} rwl={rwl} ddValue={ddValue} ddDays={ddDays} recovered={period?.recovery !== null} />
  if (KEYS === 'f') return <KeysPanels summary={s} rwl={rwl} ddValue={ddValue} ddDays={ddDays} recovered={period?.recovery !== null} />
  return (
    <section data-shot="keys" className="rise card-lift rounded-lg border border-border bg-surface p-4 [--i:3]">
      <h2 className="font-semibold">{k.keyNumbers}</h2>
      <dl className="mt-2 divide-y divide-border text-sm">
        {rows.map(([label, value, tone]) => (
          <div key={label} className="flex items-baseline justify-between gap-4 py-2">
            <dt className="text-muted">{label}</dt>
            <dd className={`num font-semibold ${tone}`}>{value}</dd>
          </div>
        ))}
      </dl>
      {s.rCount === 0 && <p className="mt-1 text-xs text-muted">{k.avgRNone}</p>}
    </section>
  )
}

type KeysProps = {
  summary: Summary
  rwl: { avgWinR: number | null; avgLossR: number | null }
  ddValue: string
  ddDays: number | null
  recovered: boolean
}

/** Вариант d: у каждой цифры — полоска от нуля (вправо фиолетовая — плюс, влево серая — минус) */
function KeysDiverging({ summary: s, rwl, ddValue, ddDays, recovered }: KeysProps) {
  const t = useT()
  const k = t.dashboard.kpi
  const shown = useShown()
  const usd = Math.max(1e-9, ...[s.expectancy, s.best, s.worst].map((v) => Math.abs(v ?? 0)))
  const r = Math.max(1e-9, ...[s.avgR, rwl.avgWinR, rwl.avgLossR].map((v) => Math.abs(v ?? 0)))
  const row = (label: string, value: string, v: number | null, max: number) => {
    const w = v === null ? 0 : (Math.abs(v) / max) * 50
    return (
      <div key={label} className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] items-center gap-3 py-2 text-sm">
        <span className="truncate text-muted">{label}</span>
        <div className="relative h-1.5 rounded-full bg-surface-2">
          <i className="absolute inset-y-[-3px] left-1/2 w-px bg-border" aria-hidden />
          <i
            className={`absolute inset-y-0 rounded-full transition-[width] duration-[900ms] ease-out ${v !== null && v < 0 ? 'right-1/2 bg-muted/50' : 'left-1/2 bg-primary'}`}
            style={{ width: shown ? `${w}%` : 0 }}
          />
        </div>
        <span className="num min-w-20 text-right font-semibold">{value}</span>
      </div>
    )
  }
  return (
    <section data-shot="keys" className="rise card-lift rounded-lg border border-border bg-surface p-4 [--i:3]">
      <h2 className="font-semibold">{k.keyNumbers}</h2>
      <div className="mt-2 divide-y divide-border">
        <div>
          {row(k.expectancy, formatPnl(s.expectancy), s.expectancy, usd)}
          {row(k.bestTrade, formatPnl(s.best), s.best, usd)}
          {row(k.worstTrade, formatPnl(s.worst), s.worst, usd)}
        </div>
        <div>
          {row(k.maxDrawdown, ddValue, s.maxDrawdownPct !== null ? -s.maxDrawdownPct : null, 0.5)}
          {ddDays !== null && (
            <div className="flex justify-between py-2 text-sm">
              <span className="text-muted">{recovered ? k.recoveredIn : k.lasting}</span>
              <span className="num font-semibold">{fmt(k.days, { n: ddDays })}</span>
            </div>
          )}
        </div>
        {s.rCount > 0 && (
          <div>
            {row(k.avgR, formatR(s.avgR), s.avgR, r)}
            {row(k.avgWinR, formatR(rwl.avgWinR), rwl.avgWinR, r)}
            {row(k.avgLossR, formatR(rwl.avgLossR), rwl.avgLossR, r)}
          </div>
        )}
      </div>
    </section>
  )
}

/** Вариант e: «отчёт» — главная цифра крупно, остальные сеткой с тонкими линиями, единицы мелко и бледно */
function KeysReport({ summary: s, rwl, ddValue, ddDays, recovered }: KeysProps) {
  const t = useT()
  const k = t.dashboard.kpi
  // «+52,25 $» → «+52,25» и «$»: единица отдельно, мельче
  const split = (v: string) => {
    const m = v.match(/^(.*?)\s*([$%R]|дн\.)$/)
    return m ? [m[1], m[2]] : [v, '']
  }
  const cell = (label: string, value: string) => {
    const [n, u] = split(value)
    return (
      <div key={label} className="border-t border-border px-1 py-3">
        <div className="text-xs text-muted">{label}</div>
        <div className="num mt-1 text-lg font-semibold">
          {n}
          {u && <span className="ml-1 text-sm font-normal text-muted">{u}</span>}
        </div>
      </div>
    )
  }
  const [en, eu] = split(formatPnl(s.expectancy))
  return (
    <section data-shot="keys" className="rise card-lift rounded-lg border border-border bg-surface p-4 [--i:3]">
      <h2 className="font-semibold">{k.keyNumbers}</h2>
      <div className="mt-4 flex items-end justify-between gap-3 border-l-2 border-primary pl-3">
        <div>
          <div className="text-xs text-muted">{k.expectancy}</div>
          <div className="num mt-1 text-3xl font-semibold">
            {en}
            <span className="ml-1 text-base font-normal text-muted">{eu}</span>
          </div>
        </div>
        <span className="text-xs text-muted">{k.expectancyHint}</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-6">
        {cell(k.bestTrade, formatPnl(s.best))}
        {cell(k.worstTrade, formatPnl(s.worst))}
        {cell(k.maxDrawdown, ddValue)}
        {ddDays !== null ? cell(recovered ? k.recoveredIn : k.lasting, fmt(k.days, { n: ddDays })) : cell(k.avgR, formatR(s.avgR))}
        {s.rCount > 0 && cell(k.avgWinR, formatR(rwl.avgWinR))}
        {s.rCount > 0 && cell(k.avgLossR, formatR(rwl.avgLossR))}
      </div>
    </section>
  )
}

/** Вариант f: три мини-панели с картинками — разброс сделок, глубина просадки, R выигрыша против R проигрыша */
function KeysPanels({ summary: s, rwl, ddValue, ddDays, recovered }: KeysProps) {
  const t = useT()
  const k = t.dashboard.kpi
  const shown = useShown()
  const lo = Math.min(0, s.worst ?? 0)
  const hi = Math.max(0, s.best ?? 0)
  const pos = (v: number) => `${((v - lo) / (hi - lo || 1)) * 100}%`
  const dd = s.maxDrawdownPct ?? 0
  const win = Math.abs(rwl.avgWinR ?? 0)
  const loss = Math.abs(rwl.avgLossR ?? 0)
  const panel = 'rounded-md bg-surface-2/50 p-3'
  return (
    <section data-shot="keys" className="rise card-lift flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 [--i:3]">
      <h2 className="font-semibold">{k.keyNumbers}</h2>
      {/* разброс: от худшей до лучшей сделки, отметка — матожидание */}
      <div className={panel}>
        <div className="flex items-baseline justify-between text-xs text-muted">
          <span>{k.worstTrade}</span>
          <span>{k.expectancy}</span>
          <span>{k.bestTrade}</span>
        </div>
        <div className="relative mt-3 h-2 rounded-full bg-surface-2">
          <i className="absolute inset-y-0 rounded-l-full bg-muted/45" style={{ left: 0, width: pos(0) }} />
          <i className="absolute inset-y-0 rounded-r-full bg-primary/70" style={{ left: pos(0), right: 0 }} />
          <i className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-primary" style={{ left: pos(s.expectancy ?? 0) }} />
        </div>
        <div className="num mt-2 flex items-baseline justify-between text-sm font-semibold">
          <span className="text-muted">{formatPnl(s.worst)}</span>
          <span>{formatPnl(s.expectancy)}</span>
          <span>{formatPnl(s.best)}</span>
        </div>
      </div>
      {/* просадка: глубина от 0 до 50 % */}
      <div className={panel}>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs text-muted">{k.maxDrawdown}</span>
          <span className="num text-lg font-semibold">{ddValue}</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <i className="block h-full rounded-full bg-primary transition-[width] duration-[900ms] ease-out" style={{ width: shown ? `${Math.min(1, dd / 0.5) * 100}%` : 0 }} />
        </div>
        {ddDays !== null && (
          <div className="mt-2 text-xs text-muted">
            {recovered ? k.recoveredIn : k.lasting} <span className="num font-semibold text-text">{fmt(k.days, { n: ddDays })}</span>
          </div>
        )}
      </div>
      {/* R: средний выигрыш против среднего проигрыша — одна полоса из двух частей */}
      {s.rCount > 0 && (
        <div className={panel}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs text-muted">{k.avgR}</span>
            <span className="num text-lg font-semibold">{formatR(s.avgR)}</span>
          </div>
          <div className="mt-2 flex h-1.5 gap-0.5 overflow-hidden rounded-full">
            <i className="block bg-primary" style={{ flex: win || 1 }} />
            <i className="block bg-muted/45" style={{ flex: loss || 1 }} />
          </div>
          <div className="num mt-2 flex justify-between text-xs">
            <span>
              <span className="text-muted">{k.avgWinR} </span>
              {formatR(rwl.avgWinR)}
            </span>
            <span>
              <span className="text-muted">{k.avgLossR} </span>
              {formatR(rwl.avgLossR)}
            </span>
          </div>
        </div>
      )}
    </section>
  )
}

function signedPercent(fraction: number): string {
  const s = formatPercent(Math.abs(fraction))
  return fraction > 0 ? `+${s}` : fraction < 0 ? `−${s}` : s
}
