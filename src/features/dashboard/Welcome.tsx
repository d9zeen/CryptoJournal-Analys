/**
 * Первый вход: сделок ещё нет. Вместо пустого экрана — пример статистики на выдуманных сделках
 * и три пути начать: подключить биржу, загрузить файл, добавить вручную.
 */
import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { fmt, useT } from '@/i18n'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { formatPercent, formatPnl } from '@/lib/format'
import { prefersReducedMotion } from '@/lib/motion'
import { demoAccount } from '@/features/landing/demo'
import type { ClosedTrade } from '@/lib/calc/stats'
import { KeyNumbers, KpiRow, ScoreCard } from './Widgets'

const EquityChart = lazy(() => import('./charts').then((m) => ({ default: m.EquityChart })))
const DailyPnlChart = lazy(() => import('./charts').then((m) => ({ default: m.DailyPnlChart })))

export type WelcomeVariant = 'a' | 'b' | 'c'

export function Welcome({ variant = 'a', wide }: { variant?: WelcomeVariant; wide: boolean }) {
  const demo = useMemo(() => demoAccount(), [])
  if (variant === 'b') return <WelcomeChecklist trades={demo.trades} />
  if (variant === 'c') return <WelcomeFlow demo={demo} />
  return <WelcomeExample demo={demo} wide={wide} />
}

type Demo = ReturnType<typeof demoAccount>

/* ───────── Вариант А: пример-дашборд под пеленой + полоса действий ───────── */

function WelcomeExample({ demo, wide }: { demo: Demo; wide: boolean }) {
  const t = useT()
  const w = t.dashboard.welcome
  return (
    <>
      <Card className="rise !p-5">
        <h2 className="text-lg font-semibold">{w.title}</h2>
        <p className="mt-1 max-w-2xl text-sm text-text/80">{w.lead}</p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <PathTiles />
        </div>
      </Card>
      <ExampleDashboard demo={demo} wide={wide} />
    </>
  )
}

function ExampleDashboard({ demo, wide }: { demo: Demo; wide: boolean }) {
  const t = useT()
  return (
    <div className="relative">
      <span className="absolute -top-2.5 left-4 z-10 rounded-md border border-border bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted">{t.dashboard.welcome.example}</span>
      {/* inert: пример нельзя кликать, клавиатура его пропускает */}
      <div inert className="flex select-none flex-col gap-4 rounded-xl border border-dashed border-border p-3 opacity-70 sm:p-4">
        <KpiRow summary={demo.summary} score={demo.score} startingBalance={demo.balance} equity={demo.equity} />
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)]">
          <ScoreCard score={demo.score} trades={demo.summary.closed} />
          <Card className="!p-4">
            <h2 className="font-semibold">{t.dashboard.charts.equity}</h2>
            <div className="mt-3 -ml-2">
              <Suspense fallback={<div className="h-[260px]" />}>
                <EquityChart points={demo.equity} unit="usd" balance={demo.balance} height={wide ? 420 : 260} />
              </Suspense>
            </div>
          </Card>
        </div>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)]">
          <KeyNumbers summary={demo.summary} curve={demo.curve} period={demo.period} rwl={demo.rwl} />
          <Card className="!p-4">
            <h2 className="font-semibold">{t.dashboard.charts.daily}</h2>
            <div className="mt-3 -ml-2">
              <Suspense fallback={<div className="h-[220px]" />}>
                <DailyPnlChart days={demo.bars.bars} unit={demo.bars.unit} height={wide ? 300 : 220} />
              </Suspense>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

/* ───────── Вариант Б: шаги слева, «живое» превью справа ───────── */

function WelcomeChecklist({ trades }: { trades: ClosedTrade[] }) {
  const t = useT()
  const w = t.dashboard.welcome
  const navigate = useNavigate()
  const steps = [
    { key: 'connect', ...w.steps.connect, actions: (
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => navigate('/import#connections')}>{w.paths.api.title}</Button>
        <Button variant="secondary" onClick={() => navigate('/import')}>{w.paths.file.title}</Button>
        <Button variant="ghost" onClick={() => navigate('/trades/new')}>{w.paths.manual.title}</Button>
      </div>
    ) },
    { key: 'balance', ...w.steps.balance, actions: (
      <div className="mt-3">
        <Button variant="secondary" onClick={() => navigate('/settings')}>{w.settings}</Button>
      </div>
    ) },
    { key: 'review', ...w.steps.review, actions: null },
  ]
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] xl:items-start">
      <Card className="rise !p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">{w.start}</h2>
          <span className="text-sm text-muted">{fmt(w.stepsDone, { n: 1 })}</span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full w-1/3 rounded-full bg-primary" />
        </div>
        <ol className="mt-5 flex flex-col">
          {steps.map((s, i) => (
            <li key={s.key} className="relative flex gap-4 pb-6 last:pb-0">
              {i < steps.length - 1 && <span aria-hidden className="absolute top-9 bottom-1 left-[15px] w-px bg-border" />}
              <span className={`flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${i === 0 ? 'border-primary bg-primary text-on-primary' : 'border-border bg-surface-2 text-muted'}`}>{i + 1}</span>
              <div className="min-w-0 pt-1">
                <p className="font-semibold">{s.title}</p>
                <p className="mt-0.5 text-sm text-text/80">{s.text}</p>
                {s.actions}
              </div>
            </li>
          ))}
        </ol>
      </Card>
      <LivePreview trades={trades} />
    </div>
  )
}

/** Сколько демо-сделок «пришло» к этому моменту: растёт по одной, в конце пауза — и заново. Без анимаций — сразу все. */
function useStream(total: number, every = 650, pause = 2600): number {
  const [n, setN] = useState(() => (prefersReducedMotion() ? total : 1))
  useEffect(() => {
    if (prefersReducedMotion()) return
    const id = window.setTimeout(() => setN((v) => (v >= total ? 1 : v + 1)), n >= total ? pause : every)
    return () => window.clearTimeout(id)
  }, [n, total, every, pause])
  return n
}

function streamStats(trades: ClosedTrade[], n: number) {
  const got = trades.slice(0, n)
  const pnl = got.reduce((a, tr) => a + tr.pnl, 0)
  const wins = got.filter((tr) => tr.pnl > 0).length
  return { got, pnl, winrate: got.length ? wins / got.length : null }
}

function LivePreview({ trades }: { trades: ClosedTrade[] }) {
  const t = useT()
  const w = t.dashboard.welcome
  const n = useStream(trades.length)
  const { got, pnl, winrate } = streamStats(trades, n)
  const last = got.slice(-5).reverse()
  return (
    <Card className="rise !p-5 [--i:1]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">{w.liveTitle}</h2>
        <span className="rounded-md border border-border bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted">{w.example}</span>
      </div>
      <p className="mt-0.5 text-xs text-muted">{w.liveHint}</p>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <Stat label={w.livePnl} value={formatPnl(pnl)} />
        <Stat label={w.liveWinrate} value={formatPercent(winrate, 0)} />
        <Stat label={w.liveTrades} value={String(got.length)} />
      </div>
      <GrowingCurve trades={trades} n={n} className="mt-4 h-40" />
      <ul className="mt-3 flex flex-col gap-1.5">
        {last.map((tr) => (
          <TradeRow key={tr.id} tr={tr} fresh={tr === last[0]} />
        ))}
      </ul>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-2 px-3 py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className="num mt-0.5 text-lg font-semibold">{value}</p>
    </div>
  )
}

function TradeRow({ tr, fresh }: { tr: ClosedTrade; fresh?: boolean }) {
  return (
    <li className={`flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm ${fresh ? 'animate-fly-in' : ''}`}>
      <span className="flex items-center gap-2">
        <span className="font-medium">{tr.symbol}</span>
        <span className="text-xs text-muted uppercase">{tr.side}</span>
      </span>
      <span className={`num font-semibold ${tr.pnl >= 0 ? 'text-primary' : 'text-muted'}`}>{formatPnl(tr.pnl)}</span>
    </li>
  )
}

/** Кривая капитала, которая дорисовывается по мере прихода сделок (масштаб — по всему примеру, чтобы росла вправо) */
function GrowingCurve({ trades, n, className = '' }: { trades: ClosedTrade[]; n: number; className?: string }) {
  const { all, min, max } = useMemo(() => {
    let cum = 0
    const all = [0, ...trades.map((tr) => (cum += tr.pnl))]
    return { all, min: Math.min(...all), max: Math.max(...all) }
  }, [trades])
  const W = 300
  const H = 100
  const x = (i: number) => (i / (all.length - 1)) * W
  const y = (v: number) => H - 6 - ((v - min) / (max - min || 1)) * (H - 12)
  const pts = all.slice(0, n + 1).map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`)
  const lastX = x(n)
  const lastY = y(all[n])
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={`w-full ${className}`} aria-hidden>
      <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="var(--color-border)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
      <polygon points={`0,${H} ${pts.join(' ')} ${lastX.toFixed(1)},${H}`} fill="var(--color-primary)" opacity={0.1} />
      <polyline points={pts.join(' ')} fill="none" stroke="var(--color-primary)" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lastX} cy={lastY} r={3} fill="var(--color-primary)" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/* ───────── Вариант В: анимация «биржа → дневник» + три больших пути ───────── */

function WelcomeFlow({ demo }: { demo: Demo }) {
  const t = useT()
  const w = t.dashboard.welcome
  const trades = demo.trades
  const n = useStream(trades.length, 900)
  const { got, pnl, winrate } = streamStats(trades, n)
  const cur = got[got.length - 1]
  const src = (['api', 'wallet', 'file'] as const)[(n - 1) % 3]
  return (
    <>
      <Card className="rise !p-5 sm:!p-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{w.flowTitle}</h2>
          <p className="mx-auto mt-2 max-w-2xl text-text/80">{w.flowLead}</p>
        </div>

        {/* сцена: источники → летящая сделка → дневник */}
        <div className="mx-auto mt-8 grid max-w-5xl items-center gap-4 md:grid-cols-[220px_minmax(0,1fr)_280px]">
          <ul className="flex flex-row flex-wrap justify-center gap-2 md:flex-col">
            {(['api', 'wallet', 'file'] as const).map((k) => (
              <li
                key={k}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors duration-300 ${k === src ? 'border-primary bg-primary/10 text-text' : 'border-border bg-surface-2 text-muted'}`}
              >
                {w.flowSources[k]}
              </li>
            ))}
          </ul>

          <div className="relative flex h-16 items-center" aria-hidden>
            <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border" />
            {cur && (
              <div key={n} className="animate-fly-in relative mx-auto flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-sm">
                <span className="font-medium">{cur.symbol}</span>
                <span className={`num font-semibold ${cur.pnl >= 0 ? 'text-primary' : 'text-muted'}`}>{formatPnl(cur.pnl)}</span>
              </div>
            )}
            <svg viewBox="0 0 10 10" className="absolute right-0 size-3 text-border" aria-hidden>
              <path d="M2 1l6 4-6 4z" fill="currentColor" />
            </svg>
          </div>

          <div className="rounded-xl border border-border bg-surface-2 p-4">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-semibold">{w.flowJournal}</p>
              <p className="text-xs text-muted">
                {w.liveTrades}: <span className="num">{got.length}</span>
              </p>
            </div>
            <p className={`num mt-2 text-2xl font-semibold ${pnl >= 0 ? 'text-text' : 'text-muted'}`}>{formatPnl(pnl)}</p>
            <p className="text-xs text-muted">
              {w.liveWinrate} <span className="num">{formatPercent(winrate, 0)}</span>
            </p>
            <GrowingCurve trades={trades} n={n} className="mt-2 h-20" />
          </div>
        </div>

        <div className="mx-auto mt-8 grid max-w-5xl gap-3 md:grid-cols-3">
          <PathTiles big />
        </div>
      </Card>

      <div className="relative">
        <span className="absolute -top-2.5 left-4 z-10 rounded-md border border-border bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted">{w.example}</span>
        <div inert className="select-none rounded-xl border border-dashed border-border p-3 opacity-70 sm:p-4">
          <KpiRow summary={demo.summary} score={demo.score} startingBalance={demo.balance} equity={demo.equity} />
        </div>
      </div>
    </>
  )
}

/* ───────── Общее: три пути начать ───────── */

function PathTiles({ big }: { big?: boolean }) {
  const t = useT()
  const p = t.dashboard.welcome.paths
  const navigate = useNavigate()
  const tiles: { key: string; to: string; title: string; text: string; icon: ReactNode; primary?: boolean }[] = [
    { key: 'api', to: '/import#connections', ...p.api, primary: true, icon: <path d="M9 7V3m6 4V3M7 7h10v4a5 5 0 01-10 0V7zm5 9v5" strokeLinecap="round" strokeLinejoin="round" /> },
    { key: 'file', to: '/import', ...p.file, icon: <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" strokeLinecap="round" strokeLinejoin="round" /> },
    { key: 'manual', to: '/trades/new', ...p.manual, icon: <path d="M12 5v14M5 12h14" strokeLinecap="round" /> },
  ]
  return tiles.map((tile) => (
    <button
      key={tile.key}
      type="button"
      onClick={() => navigate(tile.to)}
      className={`group flex items-start gap-3 rounded-lg border p-4 text-left transition-colors ${tile.primary ? 'border-primary bg-primary/10 hover:bg-primary/15' : 'border-border bg-surface-2 hover:border-muted'} ${big ? 'md:flex-col md:p-5' : ''}`}
    >
      <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${tile.primary ? 'bg-primary text-on-primary' : 'bg-surface text-text'}`}>
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
          {tile.icon}
        </svg>
      </span>
      <span>
        <span className="block font-semibold">{tile.title}</span>
        <span className="mt-0.5 block text-sm text-text/80">{tile.text}</span>
      </span>
    </button>
  ))
}
