/**
 * Виджеты дашборда в духе TradeZella: верхний ряд показателей со шкалами (полукруг, кольцо, полоска),
 * «Ключевые цифры» («Оценку трейдера» убрали 08.11.2026; расчёт traderScore остался — из него винрейт дней).
 * Шкалы — свой лёгкий SVG (pathLength = 100), при первом показе плавно заполняются.
 */
import { useId, useMemo, useRef, type CSSProperties, type ReactNode } from 'react'
import { fmt, plural, useT } from '@/i18n'
import { formatNumber, formatPercent, formatPnl, formatR, formatRatio, formatUsd } from '@/lib/format'
import { recentForm, type DrawdownPeriod, type EquityPoint, type Outcome, type Summary } from '@/lib/calc/stats'
import type { TraderScore } from '@/lib/calc/score'
import { useShown, useSpotlight } from '@/lib/motion'
import { AnimatedNumber } from '@/components/AnimatedNumber'
import { daysBetween, withTime } from './equityTime'

/** Цвета шкал — в тон кривой капитала (выбор владельца 06.11.2026): выигрыш фиолетовый, проигрыш приглушённый */
const TONE = {
  aStroke: 'stroke-primary',
  bStroke: 'stroke-muted/40',
  aBg: 'bg-primary',
  bBg: 'bg-muted/40',
  aPill: 'bg-primary/15 text-primary',
  bPill: 'bg-surface-2 text-muted',
  aText: 'text-text',
  bText: 'text-muted',
}

/** Мини-кривая капитала в карточке PnL: фиолетовая линия с мягкой заливкой, как большая кривая; рисуется слева направо (№9), drawKey — перерисовать */
function Sparkline({ points, drawKey }: { points: EquityPoint[]; drawKey?: unknown }) {
  const id = useId().replace(/:/g, '')
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
    <svg key={String(drawKey)} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-8 w-full overflow-visible" aria-hidden>
      <defs>
        <clipPath id={`${id}c`}>
          <rect className="reveal-x" x={-2} y={-4} width={W + 4} height={H + 8} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}c)`}>
        <path d={`${line}L${W} ${H}L0 ${H}Z`} className="fill-primary/15" />
        <path d={line} fill="none" className="stroke-primary" strokeWidth={1.75} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  )
}

/* шкалы дорастают за ~1 с — синхронно с набегающим числом (№8, useCountUp) */
const growCls = 'transition-[stroke-dasharray,stroke-dashoffset] duration-1000 ease-out motion-reduce:transition-none'

/* ---------- Шкалы ---------- */

/** Полукруг: доля a (прибыль) слева, доля b (убыток) справа, между ними — зазор. live — значение меняется каждый кадр (демо), без своей анимации */
export function HalfGauge({ a, b, live }: { a: number; b: number; live?: boolean }) {
  const shown = useShown() || !!live
  const grow = live ? '' : growCls
  const sum = a + b
  const gap = a > 0 && b > 0 ? 3 : 0
  const pa = sum > 0 ? (a / sum) * (100 - gap) : 0
  const pb = sum > 0 ? (b / sum) * (100 - gap) : 0
  const d = 'M8 46 A38 38 0 0 1 84 46'
  return (
    <svg viewBox="0 0 92 50" className="h-[36px] w-[66px] shrink-0 sm:h-[46px] sm:w-[84px]" aria-hidden>
      <path d={d} pathLength={100} fill="none" className="stroke-surface-2" strokeWidth={8} strokeLinecap="round" />
      {pa > 0 && (
        <path
          d={d}
          pathLength={100}
          fill="none"
          className={`${TONE.aStroke} ${grow}`}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={`${shown ? pa : 0} 100`}
        />
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

/** Подпись под profit factor: «на 1 $ убытка — 3,10 $ прибыли» (нет убытков или прибылей — без подписи) */
export function PfCaption({ pf }: { pf: number | null }) {
  const k = useT().dashboard.kpi
  if (pf === null || !Number.isFinite(pf)) return null
  return <p className="text-xs text-muted">{fmt(k.perDollar, { v: formatNumber(pf, 2) })}</p>
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

/**
 * Карточка показателя. Рамка — обёртка .spot-frame (подсветка под курсором №3, только мышь);
 * i — номер в лесенке появления (№7): карточки выезжают по очереди при первом показе страницы.
 */
export function Widget({
  label,
  hint,
  aside,
  children,
  className = '',
  i,
}: {
  label: string
  hint: string
  aside?: ReactNode
  children: ReactNode
  className?: string
  i?: number
}) {
  return (
    <div
      data-spot
      className={`spot-frame min-w-0 rounded-lg ${i !== undefined ? 'rise' : ''} ${className}`}
      style={i !== undefined ? ({ '--i': i } as CSSProperties) : undefined}
    >
      <section className="spot-card flex h-full min-w-0 flex-col gap-3 rounded-[calc(0.5rem-1px)] bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-xs font-medium text-muted">
            {label}
            <span
              title={hint}
              aria-label={hint}
              className="inline-flex size-3.5 cursor-help items-center justify-center rounded-full border border-current text-[9px] leading-none opacity-70"
            >
              i
            </span>
          </h2>
          {aside}
        </div>
        {children}
      </section>
    </div>
  )
}

export const big = 'num min-w-0 truncate text-xl leading-tight font-semibold sm:text-2xl'

/**
 * Верхний ряд. rollKey — что выбрано (период): при его смене числа прокручиваются (№13),
 * при первом показе набегают от нуля (№8), а если сделки добавились сами (синхронизация) — плавно пересчитываются (№12).
 */
export function KpiRow({
  summary: s,
  score,
  startingBalance,
  equity = [],
  rollKey,
}: {
  summary: Summary
  score: TraderScore
  startingBalance: number | null
  equity?: EquityPoint[]
  rollKey?: unknown
}) {
  const t = useT()
  const k = t.dashboard.kpi
  const grossWin = (s.avgWin ?? 0) * s.wins
  const grossLoss = -(s.avgLoss ?? 0) * s.losses
  const spotRef = useRef<HTMLDivElement>(null)
  useSpotlight(spotRef)
  const num = (value: number | null, format: (n: number) => string) =>
    value === null || !Number.isFinite(value) ? <>{value === null ? '—' : format(value)}</> : <AnimatedNumber value={value} format={format} rollKey={rollKey} />
  const ratio = s.avgWin !== null && s.avgLoss !== null && s.avgLoss < 0 ? s.avgWin / -s.avgLoss : null
  const toDeposit = startingBalance ? fmt(k.toDeposit, { p: signedPercent(s.totalPnl / startingBalance) }) : null

  return (
    <div ref={spotRef} data-shot="kpi" className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-[minmax(0,1.35fr)_repeat(4,minmax(0,1fr))]">
      <Widget
        label={k.totalPnl}
        hint={k.hints.totalPnl}
        className="col-span-2 md:col-span-4 xl:col-span-1"
        i={0}
        aside={<span className="num shrink-0 rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted">{fmt(k.trades, { n: s.closed })}</span>}
      >
        <div>
          <div className={`${big} text-[30px]`}>{num(s.totalPnl, formatPnl)}</div>
          {toDeposit && <p className="mt-0.5 text-xs text-muted">{toDeposit}</p>}
        </div>
        <Sparkline points={equity} drawKey={rollKey} />
      </Widget>

      <Widget label={k.tradeWinrate} hint={k.hints.tradeWinrate} i={1}>
        <div className="flex flex-col-reverse items-start gap-2 min-[420px]:flex-row min-[420px]:items-end min-[420px]:justify-between">
          <div className={big}>{num(s.winrate, (v) => formatPercent(v))}</div>
          <HalfGauge a={s.wins} b={s.losses} />
        </div>
        <Counts a={s.wins} b={s.losses} />
      </Widget>

      <Widget label={k.profitFactor} hint={k.hints.profitFactor} i={2}>
        <div className={big}>{s.profitFactor !== null && Number.isFinite(s.profitFactor) ? num(s.profitFactor, formatRatio) : formatRatio(s.profitFactor)}</div>
        <PfCaption pf={s.profitFactor} />
        <div className="num flex justify-between gap-2 text-xs">
          <span className={`whitespace-nowrap ${TONE.aText}`}>{formatUsd(grossWin)}</span>
          <span className={`whitespace-nowrap ${TONE.bText}`}>−{formatUsd(grossLoss)}</span>
        </div>
      </Widget>

      <Widget label={k.dayWinrate} hint={k.hints.dayWinrate} i={3}>
        <div className="flex flex-col-reverse items-start gap-2 min-[420px]:flex-row min-[420px]:items-end min-[420px]:justify-between">
          <div className={big}>{num(score.dayWinrate, (v) => formatPercent(v))}</div>
          <HalfGauge a={score.dayWins} b={score.dayLosses} />
        </div>
        <Counts a={score.dayWins} b={score.dayLosses} />
      </Widget>

      <Widget label={k.avgWinLoss} hint={k.hints.avgWinLoss} i={4}>
        <div className={big}>{num(ratio, (v) => formatNumber(v, 2))}</div>
        <PairBars win={s.avgWin ?? 0} loss={-(s.avgLoss ?? 0)} />
        <div className="num flex justify-between gap-2 text-xs">
          <span className={TONE.aText}>{formatPnl(s.avgWin)}</span>
          <span className={TONE.bText}>{formatPnl(s.avgLoss)}</span>
        </div>
      </Widget>
    </div>
  )
}

/** «Таблетки» с количеством под шкалой: «61 W», «29 L» (в прибыль / в убыток) */
export function Counts({ a, b }: { a: number; b: number }) {
  const f = useT().dashboard.kpi.form
  return (
    <div className="num flex gap-1.5 text-xs font-semibold">
      <span className={`rounded-md px-1.5 py-0.5 ${TONE.aPill}`}>
        {a} {f.winLetter}
      </span>
      <span className={`rounded-md px-1.5 py-0.5 ${TONE.bPill}`}>
        {b} {f.lossLetter}
      </span>
    </div>
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
  // длительность максимальной просадки: от пика до восстановления (или до последней сделки)
  const ddDays = useMemo(() => {
    if (!period) return null
    const tp = withTime(curve)
    return daysBetween(tp[period.peak].t, tp[period.recovery ?? tp.length - 1].t)
  }, [curve, period])
  const ddValue = s.maxDrawdown <= 0 ? '—' : s.maxDrawdownPct !== null ? `−${formatPercent(s.maxDrawdownPct)}` : `−${formatUsd(s.maxDrawdown)}`
  // выбор владельца 06.11.2026: три мини-панели (разброс сделок, просадка, R) + «форма» последних сделок
  return (
    <KeysPanels summary={s} rwl={rwl} ddValue={ddValue} ddDays={ddDays} recovered={period !== null && period.recovery !== null}>
      <FormPanel trades={curve.slice(1)} />
    </KeysPanels>
  )
}

type KeysProps = {
  summary: Summary
  rwl: { avgWinR: number | null; avgLossR: number | null }
  ddValue: string
  ddDays: number | null
  recovered: boolean
  children?: ReactNode
}

/** «Ключевые цифры»: три мини-панели с картинками — разброс сделок, глубина просадки, R выигрыша против R проигрыша */
function KeysPanels({ summary: s, rwl, ddValue, ddDays, recovered, children }: KeysProps) {
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
    <section data-shot="keys" className="rise card-lift flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 [--i:5]">
      <h2 className="font-semibold">{k.keyNumbers}</h2>
      {children}
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
          <i
            className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-primary"
            style={{ left: pos(s.expectancy ?? 0) }}
          />
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
          <i
            className="block h-full rounded-full bg-primary transition-[width] duration-[900ms] ease-out"
            style={{ width: shown ? `${Math.min(1, dd / 0.5) * 100}%` : 0 }}
          />
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

/* ---------- «Форма»: последние сделки — только победы и поражения ---------- */

const FORM_N = 10

/** Последние 10 сделок буквами W / L, как форма команды (выбор владельца 07.11.2026): победа — цветом «плюса» (--color-up), поражение — «минуса» (--color-down) */
function FormPanel({ trades }: { trades: { pnl: number }[] }) {
  const t = useT()
  const f = t.dashboard.kpi.form
  const form = useMemo(() => recentForm(trades, FORM_N), [trades])
  if (!form.items.length) return null
  const streak = form.streak && form.streak.length >= 2 ? plural(form.streak.length, form.streak.kind === 'win' ? f.streakWin : f.streakLoss) : null
  const label = (o: Outcome) => (o === 'win' ? f.win : o === 'loss' ? f.loss : f.even)
  return (
    <div data-shot="form" className="rounded-md bg-surface-2/50 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-xs text-muted">{plural(form.items.length, f.title)}</span>
        <span className="num text-sm">
          <span className="font-semibold text-up">{form.wins}</span> <span className="text-muted">{plural(form.wins, f.wins)}</span>
          <span className="text-muted"> · </span>
          <span className="font-semibold text-down">{form.losses}</span> <span className="text-muted">{plural(form.losses, f.losses)}</span>
        </span>
      </div>
      <ol className="mt-2.5 flex flex-wrap gap-1.5">
        {form.items.map((o, i) => (
          <li
            key={i}
            title={label(o)}
            aria-label={label(o)}
            className={`num flex size-7 items-center justify-center rounded-md text-xs font-bold ${
              o === 'win' ? 'bg-up/15 text-up' : o === 'loss' ? 'bg-down/15 text-down' : 'border border-dashed border-border text-muted'
            }`}
          >
            {o === 'win' ? f.winLetter : o === 'loss' ? f.lossLetter : f.evenLetter}
          </li>
        ))}
      </ol>
      {streak && <p className={`mt-2 text-xs ${form.streak!.kind === 'win' ? 'text-up' : 'text-down'}`}>{streak}</p>}
    </div>
  )
}
