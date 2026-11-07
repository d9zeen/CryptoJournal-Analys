/**
 * Главная для тех, кто ещё не вошёл: что это, живой дашборд демо-счёта, возможности, шаги, тарифы, вопросы.
 * Превью — настоящие виджеты дашборда на выдуманных сделках (demo.ts), а не картинка.
 */
import { lazy, Suspense, useMemo } from 'react'
import { Link } from 'react-router'
import { plural, useT } from '@/i18n'
import { Logo } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useAuth } from '@/features/auth/AuthProvider'
import { PlansTable } from '@/features/plans/PlansPage'
import { KpiRow, ScoreCard } from '@/features/dashboard/Widgets'
import { formatPnl, pnlClass } from '@/lib/format'
import { Reveal } from './Reveal'
import { demoAccount } from './demo'

const EquityChart = lazy(() => import('@/features/dashboard/charts').then((m) => ({ default: m.EquityChart })))

/** Как подключается каждая биржа (названия бирж — не перевод, поэтому прямо здесь) */
const WAYS = [
  { key: 'api', names: ['Bybit'] },
  { key: 'wallet', names: ['Hyperliquid', 'Polymarket'] },
  { key: 'file', names: ['Bybit', 'Binance', 'OKX', 'BingX', 'Bitget', 'MEXC'] },
] as const

const btn = 'inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors'
const btnPrimary = `${btn} bg-primary text-on-primary hover:bg-primary-hover`
const btnSecondary = `${btn} border border-border bg-surface-2 text-text hover:border-muted/60`
const wrap = 'mx-auto w-full max-w-[1320px] px-4 sm:px-6'

export function LandingPage() {
  const t = useT()
  const l = t.landing
  const demo = useMemo(() => demoAccount(), [])
  const { user } = useAuth()

  return (
    <div className="min-h-dvh">
      {/* шапка */}
      <header className="sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur">
        <div className={`${wrap} flex h-14 items-center justify-between gap-4`}>
          <Link to="/" aria-label={t.app.name}>
            <Logo />
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted md:flex">
            <a href="#features" className="hover:text-text">
              {l.nav.features}
            </a>
            <a href="#pricing" className="hover:text-text">
              {l.nav.pricing}
            </a>
            <a href="#faq" className="hover:text-text">
              {l.nav.faq}
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {user ? (
              // уже вошёл (смотрит /welcome) — одна кнопка в дневник
              <Link to="/dashboard" className={`${btnPrimary} !px-3 !py-2`}>
                {l.open}
              </Link>
            ) : (
              <>
                <Link to="/login" className={`${btnSecondary} !px-3 !py-2`}>
                  {l.login}
                </Link>
                <span className="hidden sm:contents">
                  <Link to="/register" className={`${btnPrimary} !px-3 !py-2`}>
                    {l.start}
                  </Link>
                </span>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* первый экран */}
        <section className={`${wrap} pt-12 pb-10 sm:pt-20`}>
          <div className="max-w-3xl">
            <Reveal>
              <h1 className="text-4xl leading-[1.08] font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">{l.title}</h1>
            </Reveal>
            <Reveal delay={90} className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/register" className={`${btnPrimary} !px-5 !py-3`}>
                {l.start}
              </Link>
              <Link to="/login" className={`${btnSecondary} !px-5 !py-3`}>
                {l.login}
              </Link>
            </Reveal>
          </div>

          {/* живое превью дашборда */}
          <Reveal delay={180} className="mt-12 rounded-xl border border-border bg-surface/40 p-2 sm:p-3">
            <div className="flex items-center gap-1.5 px-2 pt-1 pb-2.5">
              <i className="size-2.5 rounded-full bg-border" />
              <i className="size-2.5 rounded-full bg-border" />
              <i className="size-2.5 rounded-full bg-border" />
              <span className="ml-2 truncate text-xs text-muted">{l.previewLabel}</span>
            </div>
            <div className="flex flex-col gap-3 rounded-lg bg-bg p-3 sm:p-4">
              <KpiRow summary={demo.summary} score={demo.score} startingBalance={demo.balance} equity={demo.equity} />
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)]">
                <div className="hidden lg:block">
                  <ScoreCard score={demo.score} trades={demo.summary.closed} />
                </div>
                <div className="rounded-lg border border-border bg-surface p-4">
                  <Suspense fallback={<div className="h-[300px]" />}>
                    <EquityChart points={demo.equity} unit="usd" balance={demo.balance} height={430} />
                  </Suspense>
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        {/* биржи: отдельная плашка — как подключается каждая */}
        <section className={`${wrap} pb-6`} aria-labelledby="exchanges-title">
          <Reveal className="rounded-xl border border-border bg-surface p-5 sm:p-8">
            <h2 id="exchanges-title" className="text-2xl font-bold tracking-tight sm:text-3xl">
              {l.exchanges.title}
            </h2>
            <p className="mt-2 text-text/80">{l.exchanges.hint}</p>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {WAYS.map((w, i) => (
                <Reveal key={w.key} delay={120 + i * 90} className="flex flex-col rounded-lg border border-border bg-bg/60 p-4 sm:p-5">
                  <h3 className="font-semibold">{l.exchanges.ways[w.key].title}</h3>
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {w.names.map((n) => (
                      <li key={n} className="rounded-md bg-primary/12 px-2 py-1 text-sm font-semibold text-primary">
                        {n}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-sm leading-relaxed text-text/80">{l.exchanges.ways[w.key].text}</p>
                </Reveal>
              ))}
            </div>
            <p className="mt-4 text-sm text-text/80">{l.exchanges.soon}</p>
          </Reveal>
        </section>

        {/* возможности: строки «текст — картинка», через одну меняются местами */}
        <section id="features" className={`${wrap} scroll-mt-20 py-16 sm:py-24`}>
          <Reveal as="h2" className="text-3xl font-bold tracking-tight sm:text-4xl">
            {l.features.title}
          </Reveal>
          <div className="mt-12 grid gap-16 sm:gap-24">
            <Feature title={l.features.sync.title} text={l.features.sync.text}>
              <SyncVisual />
            </Feature>
            <Feature title={l.features.leaks.title} text={l.features.leaks.text} flip>
              <LeaksVisual />
            </Feature>
            <Feature title={l.features.calendar.title} text={l.features.calendar.text}>
              <CalendarVisual />
            </Feature>
          </div>
        </section>

        {/* шаги */}
        <section className="border-t border-border bg-surface/40 py-16 sm:py-20">
          <div className={wrap}>
            <Reveal as="h2" className="text-3xl font-bold tracking-tight sm:text-4xl">
              {l.steps.title}
            </Reveal>
            <ol className="mt-10 grid gap-8 md:grid-cols-3">
              {(['a', 'b', 'c'] as const).map((k, i) => (
                <Reveal as="li" key={k} delay={i * 90} className="border-t-2 border-primary pt-5">
                  <div className="num text-sm font-semibold text-primary">0{i + 1}</div>
                  <h3 className="mt-2 text-lg font-semibold">{l.steps[k].title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-text/80">{l.steps[k].text}</p>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* тарифы */}
        <section id="pricing" className={`${wrap} scroll-mt-20 py-16 sm:py-24`}>
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{l.pricingTitle}</h2>
            <p className="mt-3 text-text/80">{l.pricingHint}</p>
          </Reveal>
          <Reveal delay={90} className="mt-8">
            <PlansTable
              action={(plan) => (
                <Link to="/register" className={`${plan.id === 'pro_plus' ? btnPrimary : btnSecondary} w-full !px-2`}>
                  {l.pick}
                </Link>
              )}
            />
          </Reveal>
        </section>

        {/* вопросы */}
        <section id="faq" className="scroll-mt-20 border-t border-border py-16 sm:py-24">
          <div className={`${wrap} grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]`}>
            <Reveal as="h2" className="text-3xl font-bold tracking-tight sm:text-4xl">
              {l.faq.title}
            </Reveal>
            <div className="divide-y divide-border border-y border-border">
              {(['a', 'b', 'c', 'd'] as const).map((k, i) => (
                <Reveal as="details" key={k} delay={i * 70} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                    {l.faq.items[k].q}
                    <span className="text-xl leading-none text-muted transition-transform group-open:rotate-45" aria-hidden>
                      +
                    </span>
                  </summary>
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text/80">{l.faq.items[k].a}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8">
        <div className={`${wrap} flex flex-wrap items-center justify-between gap-4 text-sm text-muted`}>
          <Logo />
          <span>{l.footer}</span>
          <div className="flex gap-4">
            <Link to="/login" className="hover:text-text">
              {l.login}
            </Link>
            <Link to="/register" className="hover:text-text">
              {l.register}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

function Feature({ title, text, flip = false, children }: { title: string; text: string; flip?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
      <Reveal className={flip ? 'lg:order-2' : ''}>
        <h3 className="text-2xl font-bold tracking-tight">{title}</h3>
        <p className="mt-3 max-w-lg leading-relaxed text-text/80">{text}</p>
      </Reveal>
      <Reveal delay={90}>{children}</Reveal>
    </div>
  )
}

/* ---------- маленькие «скриншоты» из интерфейса ---------- */

function SyncVisual() {
  const t = useT()
  const f = t.landing.features.sync
  const rows: [string, number][] = [
    [f.rows.a, 248.4],
    [f.rows.b, -61.2],
    [f.rows.c, 119.75],
  ]
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3 text-xs text-muted">
        <span className="font-semibold text-text">Bybit</span>
        <span className="flex items-center gap-1.5">
          <i className="size-1.5 rounded-full bg-profit" />
          {f.synced}
        </span>
      </div>
      <ul className="mt-3 divide-y divide-border">
        {rows.map(([name, pnl]) => (
          <li key={name} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span>{name}</span>
            <span className={`num font-semibold ${pnlClass(pnl)}`}>{formatPnl(pnl)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function LeaksVisual() {
  const t = useT()
  const f = t.landing.features.leaks
  const rows: [string, number, number][] = [
    [f.rows.a, 34, 1840.5],
    [f.rows.b, 21, 412.3],
    [f.rows.c, 9, -906.8],
  ]
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted">
          <tr>
            <th className="px-4 py-3 text-left font-normal">{f.cols.name}</th>
            <th className="px-4 py-3 text-right font-normal">{f.cols.trades}</th>
            <th className="px-4 py-3 text-right font-normal">{f.cols.pnl}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, n, pnl]) => (
            <tr key={name} className={`border-t border-border ${pnl < 0 ? 'bg-loss/8' : ''}`}>
              <td className="px-4 py-3">{name}</td>
              <td className="num px-4 py-3 text-right text-muted">{n}</td>
              <td className={`num px-4 py-3 text-right font-semibold ${pnlClass(pnl)}`}>{formatPnl(pnl)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** «+248 $» / «−61 $» — целые доллары, чтобы влезало в клетку календаря */
const wholeUsd = (n: number) => `${n > 0 ? '+' : '−'}${Math.round(Math.abs(n))} $`

function CalendarVisual() {
  const t = useT()
  // выдуманный месяц: 1-е число — среда; [число, PnL, сделок]; дни без сделок — 0
  const pnl: Record<number, [number, number]> = {
    1: [248.4, 3], 2: [-61.2, 1], 3: [119.75, 2], 6: [312.1, 4], 7: [-88.5, 2], 8: [54.3, 1], 9: [-140.2, 3],
    10: [205.6, 2], 13: [-35.9, 1], 14: [176.4, 3], 15: [92.2, 2], 16: [410.7, 5], 17: [-72.6, 2], 20: [138.9, 2],
    21: [64.1, 1], 22: [-118.3, 2], 23: [227.5, 3], 24: [41.8, 1], 27: [-54.4, 1], 28: [189.3, 2],
  }
  const lead = [29, 30] // хвост прошлого месяца (Пн, Вт)
  const cells: ({ day: number; out: true } | { day: number; out?: false })[] = [
    ...lead.map((day) => ({ day, out: true as const })),
    ...Array.from({ length: 30 }, (_, i) => ({ day: i + 1 })),
    ...[1, 2, 3].map((day) => ({ day, out: true as const })),
  ]
  return (
    <div className="rounded-xl border border-border bg-surface p-3 sm:p-4">
      <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[11px] text-muted sm:gap-1.5">
        {t.period.weekdaysShort.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {cells.map((c, i) => {
          const d = c.out ? undefined : pnl[c.day]
          const tone = !d ? (c.out ? 'cal-hatch border-transparent' : 'border-border bg-surface-2/50') : d[0] > 0 ? 'border-up/45 bg-up/18' : 'border-down/45 bg-down/18'
          return (
            <div key={i} className={`relative flex min-h-12 flex-col items-center justify-center rounded-md border px-0.5 pt-3 pb-1 sm:min-h-16 ${tone}`}>
              <span className={`absolute top-0.5 right-1 text-[9px] sm:text-[10px] ${c.out ? 'text-muted/60' : 'text-muted'}`}>{c.day}</span>
              {d && (
                <>
                  <span className={`num text-[10px] leading-tight font-semibold sm:text-xs ${d[0] > 0 ? 'text-up' : 'text-down'}`}>{wholeUsd(d[0])}</span>
                  <span className="hidden text-[10px] text-muted sm:block">{plural(d[1], t.dashboard.calendar.tradesN)}</span>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
