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

/* ВРЕМЕННО: варианты для выбора владельцем (см. lib/designPreview.ts) */
const KPI = previewVariant('kpi')
const KEYS = previewVariant('keys')
/** Цвета шкал: a — прибыль / убыток (зелёный / красный), b — в тон кривой (фиолетовый / приглушённый) */
const TONE =
  KPI === 'a'
    ? { aStroke: 'stroke-profit', bStroke: 'stroke-loss', aBg: 'bg-profit', bBg: 'bg-loss', aPill: 'bg-profit/12 text-profit', bPill: 'bg-loss/12 text-loss', aText: 'text-profit', bText: 'text-loss' }
    : { aStroke: 'stroke-primary', bStroke: 'stroke-muted/40', aBg: 'bg-primary', bBg: 'bg-muted/40', aPill: 'bg-primary/15 text-primary', bPill: 'bg-surface-2 text-muted', aText: 'text-text', bText: 'text-muted' }

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

export function KpiRow({ summary: s, score, startingBalance }: { summary: Summary; score: TraderScore; startingBalance: number | null }) {
  const t = useT()
  const k = t.dashboard.kpi
  const grossWin = (s.avgWin ?? 0) * s.wins
  const grossLoss = -(s.avgLoss ?? 0) * s.losses
  const pnl = useCountUp(s.totalPnl)
  const ratio = s.avgWin !== null && s.avgLoss !== null && s.avgLoss < 0 ? s.avgWin / -s.avgLoss : null
  const toDeposit = startingBalance ? fmt(k.toDeposit, { p: signedPercent(s.totalPnl / startingBalance) }) : null

  if (KPI === 'c') return <KpiStrip summary={s} score={score} toDeposit={toDeposit} ratio={ratio} />
  const pnlTone = KPI === 'a' ? pnlClass(s.totalPnl) : ''
  return (
    <div data-shot="kpi" className="rise grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-[minmax(0,1.35fr)_repeat(4,minmax(0,1fr))]">
      <Widget
        label={k.totalPnl}
        hint={k.hints.totalPnl}
        className="col-span-2 md:col-span-4 xl:col-span-1"
        aside={<span className="num shrink-0 rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted">{fmt(k.trades, { n: s.closed })}</span>}
      >
        <div className={`${big} text-[30px] ${pnlTone}`}>{formatPnl(pnl)}</div>
        {toDeposit && <p className="text-xs text-muted">{toDeposit}</p>}
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

/** Вариант c: одна полоса показателей с разделителями, под цифрой — тонкая фиолетовая шкала */
function KpiStrip({ summary: s, score, toDeposit, ratio }: { summary: Summary; score: TraderScore; toDeposit: string | null; ratio: number | null }) {
  const t = useT()
  const k = t.dashboard.kpi
  const pnl = useCountUp(s.totalPnl)
  const shown = useShown()
  const cell = (label: string, hint: string, value: string, share: number | null, sub: ReactNode) => (
    <div className="flex min-w-0 flex-col gap-2 bg-surface p-4 sm:p-5">
      <span className="text-xs text-muted" title={hint}>
        {label}
      </span>
      <span className="num truncate text-2xl leading-tight font-semibold">{value}</span>
      {share !== null && (
        <div className="h-1 overflow-hidden rounded-full bg-surface-2">
          <i className="block h-full rounded-full bg-primary transition-[width] duration-[900ms] ease-out" style={{ width: shown ? `${Math.min(1, share) * 100}%` : 0 }} />
        </div>
      )}
      <span className="num text-xs text-muted">{sub}</span>
    </div>
  )
  return (
    <section data-shot="kpi" className="rise grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-5">
      <div className="col-span-2 flex min-w-0 flex-col gap-2 bg-surface p-4 sm:p-5 md:col-span-1">
        <span className="text-xs text-muted" title={k.hints.totalPnl}>
          {k.totalPnl}
        </span>
        <span className={`num truncate text-[28px] leading-tight font-semibold ${pnlClass(s.totalPnl)}`}>{formatPnl(pnl)}</span>
        <span className="text-xs text-muted">
          {fmt(k.trades, { n: s.closed })}
          {toDeposit ? ` · ${toDeposit}` : ''}
        </span>
      </div>
      {cell(k.tradeWinrate, k.hints.tradeWinrate, formatPercent(s.winrate), s.winrate, fmt(k.winLoss, { w: s.wins, l: s.losses }))}
      {cell(k.profitFactor, k.hints.profitFactor, formatRatio(s.profitFactor), s.profitFactor === null ? null : s.profitFactor / 3, k.profitFactorHint)}
      {cell(k.dayWinrate, k.hints.dayWinrate, formatPercent(score.dayWinrate), score.dayWinrate, fmt(k.dayWinLoss, { w: score.dayWins, l: score.dayLosses }))}
      {cell(k.avgWinLoss, k.hints.avgWinLoss, ratio === null ? '—' : formatNumber(ratio, 2), ratio === null ? null : ratio / 3, `${formatPnl(s.avgWin)} / ${formatPnl(s.avgLoss)}`)}
    </section>
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
  const tone = score.total >= 70 ? 'bg-profit' : score.total >= 40 ? 'bg-warning' : 'bg-loss'
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
  if (KEYS === 'b')
    // вариант b: плитки 2 × N — подпись мелко, цифра крупно, цвет только у знака
    return (
      <section data-shot="keys" className="rise card-lift rounded-lg border border-border bg-surface p-4 [--i:3]">
        <h2 className="font-semibold">{k.keyNumbers}</h2>
        <dl className="mt-3 grid grid-cols-2 gap-2">
          {rows.map(([label, value, tone]) => (
            <div key={label} className="rounded-md bg-surface-2/60 px-3 py-2.5">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className={`num mt-1 text-lg font-semibold ${tone === 'text-loss' ? 'text-loss' : 'text-text'}`}>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    )
  if (KEYS === 'c') {
    // вариант c: группы «Сделки / Риск / R», цифры цветом текста, фиолетовая метка у группы
    const groups: [string, [string, string, string][]][] = [
      [k.groups.trades, rows.slice(0, 3)],
      [k.groups.risk, rows.filter(([l]) => l === k.maxDrawdown || l === k.recoveredIn || l === k.lasting)],
      [k.groups.r, rows.filter(([l]) => l === k.avgR || l === k.avgWinR || l === k.avgLossR)],
    ]
    return (
      <section data-shot="keys" className="rise card-lift rounded-lg border border-border bg-surface p-4 [--i:3]">
        <h2 className="font-semibold">{k.keyNumbers}</h2>
        <div className="mt-3 grid gap-4">
          {groups.map(([title, list]) => (
            <div key={title}>
              <h3 className="flex items-center gap-2 text-[11px] font-semibold tracking-wide text-muted uppercase">
                <i className="h-3 w-0.5 rounded-full bg-primary" aria-hidden />
                {title}
              </h3>
              <dl className="mt-1.5 text-sm">
                {list.map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-4 py-1.5">
                    <dt className="text-muted">{label}</dt>
                    <dd className="num font-semibold">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </section>
    )
  }
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

function signedPercent(fraction: number): string {
  const s = formatPercent(Math.abs(fraction))
  return fraction > 0 ? `+${s}` : fraction < 0 ? `−${s}` : s
}
