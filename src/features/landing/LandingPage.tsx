/**
 * Главная для тех, кто ещё не вошёл: что это, живой дашборд демо-счёта, возможности, шаги, тарифы, вопросы.
 * Превью — настоящие виджеты дашборда на выдуманных сделках (demo.ts), а не картинка.
 */
import { lazy, Suspense, useMemo } from 'react'
import { Link } from 'react-router'
import { useT } from '@/i18n'
import { Logo } from '@/components/Logo'
import { PlansTable } from '@/features/plans/PlansPage'
import { KpiRow, ScoreCard } from '@/features/dashboard/Widgets'
import { formatPnl, pnlClass } from '@/lib/format'
import { Reveal } from './Reveal'
import { demoAccount } from './demo'

const EquityChart = lazy(() => import('@/features/dashboard/charts').then((m) => ({ default: m.EquityChart })))

const EXCHANGES = ['Bybit', 'Hyperliquid', 'Polymarket', 'Binance', 'OKX', 'BingX', 'Bitget', 'MEXC']

const btn = 'inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors'
const btnPrimary = `${btn} bg-primary text-on-primary hover:bg-primary-hover`
const btnSecondary = `${btn} border border-border bg-surface-2 text-text hover:border-muted/60`
const wrap = 'mx-auto w-full max-w-[1320px] px-4 sm:px-6'

export function LandingPage() {
  const t = useT()
  const l = t.landing
  const demo = useMemo(() => demoAccount(), [])

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
            <Link to="/login" className={`${btnSecondary} !px-3 !py-2`}>
              {l.login}
            </Link>
            <span className="hidden sm:contents">
              <Link to="/register" className={`${btnPrimary} !px-3 !py-2`}>
                {l.start}
              </Link>
            </span>
          </div>
        </div>
      </header>

      <main>
        {/* первый экран */}
        <section className={`${wrap} pt-12 pb-10 sm:pt-20`}>
          <div className="rise max-w-3xl">
            <p className="text-sm font-medium text-accent">{l.eyebrow}</p>
            <h1 className="mt-3 text-4xl leading-[1.08] font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">{l.title}</h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">{l.lead}</p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link to="/register" className={`${btnPrimary} !px-5 !py-3`}>
                {l.start}
              </Link>
              <Link to="/login" className={`${btnSecondary} !px-5 !py-3`}>
                {l.login}
              </Link>
              <span className="text-sm text-muted">{l.note}</span>
            </div>
          </div>

          {/* живое превью дашборда */}
          <div className="rise mt-12 rounded-xl border border-border bg-surface/40 p-2 sm:p-3 [--i:2]">
            <div className="flex items-center gap-1.5 px-2 pt-1 pb-2.5">
              <i className="size-2.5 rounded-full bg-border" />
              <i className="size-2.5 rounded-full bg-border" />
              <i className="size-2.5 rounded-full bg-border" />
              <span className="ml-2 truncate text-xs text-muted">{l.previewLabel}</span>
            </div>
            <div className="flex flex-col gap-3 rounded-lg bg-bg p-3 sm:p-4">
              <KpiRow summary={demo.summary} score={demo.score} startingBalance={demo.balance} />
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
          </div>
        </section>

        {/* биржи — бегущая строка */}
        <section className="border-y border-border py-5" aria-label={l.exchanges}>
          <div className={`${wrap} flex items-center gap-6`}>
            <span className="shrink-0 text-xs text-muted">{l.exchanges}</span>
            <div className="relative min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]">
              <ul className="marquee flex w-max gap-10 text-lg font-semibold text-muted">
                {[...EXCHANGES, ...EXCHANGES].map((x, i) => (
                  <li key={i} aria-hidden={i >= EXCHANGES.length || undefined}>
                    {x}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* возможности: строки «текст — картинка», через одну меняются местами */}
        <section id="features" className={`${wrap} scroll-mt-20 py-16 sm:py-24`}>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{l.features.title}</h2>
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
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{l.steps.title}</h2>
            <ol className="mt-10 grid gap-8 md:grid-cols-3">
              {(['a', 'b', 'c'] as const).map((k, i) => (
                <Reveal as="li" key={k} delay={i * 120} className="border-t-2 border-primary pt-5">
                  <div className="num text-sm font-semibold text-primary">0{i + 1}</div>
                  <h3 className="mt-2 text-lg font-semibold">{l.steps[k].title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{l.steps[k].text}</p>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* тарифы */}
        <section id="pricing" className={`${wrap} scroll-mt-20 py-16 sm:py-24`}>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{l.pricingTitle}</h2>
          <p className="mt-3 text-muted">{l.pricingHint}</p>
          <Reveal className="mt-8">
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
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{l.faq.title}</h2>
            <div className="divide-y divide-border border-y border-border">
              {(['a', 'b', 'c', 'd'] as const).map((k) => (
                <details key={k} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                    {l.faq.items[k].q}
                    <span className="text-xl leading-none text-muted transition-transform group-open:rotate-45" aria-hidden>
                      +
                    </span>
                  </summary>
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">{l.faq.items[k].a}</p>
                </details>
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
        <p className="mt-3 max-w-lg leading-relaxed text-muted">{text}</p>
      </Reveal>
      <Reveal delay={120}>{children}</Reveal>
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

function CalendarVisual() {
  // 4 недели × 7 дней: + прибыль, − убыток, 0 — нет сделок (выходные чаще пустые)
  const days = [1, -1, 1, 1, 0, 0, 0, 1, 1, -1, 1, -1, 0, 0, -1, 1, 1, 1, 1, 0, 1, 1, -1, 1, 1, 1, 0, 0]
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((d, i) => (
          <div
            key={i}
            className={`aspect-square rounded-md border ${d > 0 ? 'border-profit/40 bg-profit/15' : d < 0 ? 'border-loss/40 bg-loss/15' : 'border-border bg-surface-2/50'}`}
          />
        ))}
      </div>
    </div>
  )
}
