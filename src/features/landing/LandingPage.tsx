/**
 * Главная для тех, кто ещё не вошёл: что это, живой дашборд демо-счёта, возможности, шаги, тарифы, вопросы.
 * Превью — настоящие виджеты дашборда на выдуманных сделках (demo.ts), а не картинка.
 */
import { Fragment, lazy, Suspense, useMemo } from 'react'
import { Link } from 'react-router'
import { plural, useT } from '@/i18n'
import { Logo } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useAuth } from '@/features/auth/AuthProvider'
import { KpiRow } from '@/features/dashboard/Widgets'
import { formatPnl, pnlClass } from '@/lib/format'
import { Reveal } from './Reveal'
import { SideBadge } from '@/components/SideBadge'
import { PlanCards } from './PlanCards'
import { HeroCandles } from './HeroCandles'
import { DEMO_FEATURED, demoAccount } from './demo'
import { profitCalendar, compactPnl } from '@/lib/calc/calendar'
import type { ClosedTrade } from '@/lib/calc/stats'

const EquityChart = lazy(() => import('@/features/dashboard/charts').then((m) => ({ default: m.EquityChart })))

/** Биржи в строке «Работает с»: значок-монограмма в цветах биржи (цвета — theme.css, .ex-badge) и название (не перевод) */
const EXCHANGES = [
  { id: 'bybit', mark: 'BY', name: 'Bybit' },
  { id: 'binance', mark: 'BN', name: 'Binance' },
  { id: 'okx', mark: 'OK', name: 'OKX' },
  { id: 'bingx', mark: 'BX', name: 'BingX' },
  { id: 'bitget', mark: 'BG', name: 'Bitget' },
  { id: 'mexc', mark: 'MX', name: 'MEXC' },
  { id: 'hyperliquid', mark: 'HL', name: 'Hyperliquid' },
  { id: 'polymarket', mark: 'PM', name: 'Polymarket' },
] as const

const btn = 'inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors'
const btnPrimary = `${btn} bg-primary text-on-primary hover:bg-primary-hover`
const btnSecondary = `${btn} border border-border bg-surface-2 text-text hover:border-muted/60`
const wrap = 'mx-auto w-full max-w-[1320px] px-4 sm:px-6'

export function LandingPage() {
  const t = useT()
  const l = t.landing
  const accentWords = l.titleAccent.split(' ').length
  const demo = useMemo(() => demoAccount(), [])
  const { user } = useAuth()

  return (
    <div className="min-h-dvh">
      {/* шапка */}
      <header className="animate-drop sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur">
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
          <div className="relative">
          {/* живой свечной график справа от заголовка, на фоне */}
          <HeroCandles
            className="hero-fade animate-word pointer-events-none absolute -top-10 -bottom-8 right-0 hidden w-[60%] md:block"
            style={{ animationDelay: '500ms' }}
          />
          <div className="relative max-w-3xl">
            {/* заход на сайт: слова заголовка по очереди, затем подзаголовок, кнопки и превью */}
            <h1 className="text-4xl leading-[1.08] font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl" aria-label={l.title}>
              {l.title.split(' ').map((w, i, all) => (
                <Fragment key={i}>
                  {i > 0 && ' '}
                  {/* конец заголовка (фьючерсы, спот, Polymarket) — цветом кнопок */}
                  <span
                    aria-hidden
                    className={`animate-word inline-block ${i >= all.length - accentWords ? 'text-primary' : ''}`}
                    style={{ animationDelay: `${150 + i * 70}ms` }}
                  >
                    {w}
                  </span>
                </Fragment>
              ))}
            </h1>
            <Reveal delay={550}>
              <p className="mt-4 max-w-xl text-lg leading-snug text-balance text-text/75 sm:text-xl">
                {l.subtitle}
              </p>
            </Reveal>
            <Reveal delay={680} className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/register" className={`${btnPrimary} !px-5 !py-3`}>
                {l.start}
              </Link>
              <Link to="/login" className={`${btnSecondary} !px-5 !py-3`}>
                {l.login}
              </Link>
            </Reveal>
          </div>
          </div>

          {/* живое превью дашборда */}
          <Reveal delay={820} zoom className="mt-12 rounded-xl border border-border bg-surface/40 p-2 sm:p-3">
            <div className="flex items-center gap-1.5 px-2 pt-1 pb-2.5">
              <i className="size-2.5 rounded-full bg-border" />
              <i className="size-2.5 rounded-full bg-border" />
              <i className="size-2.5 rounded-full bg-border" />
              <span className="ml-2 truncate text-xs text-muted">{l.previewLabel}</span>
            </div>
            <div className="flex flex-col gap-3 rounded-lg bg-bg p-3 sm:p-4">
              <KpiRow summary={demo.summary} score={demo.score} startingBalance={demo.balance} equity={demo.equity} />
              <div className="rounded-lg border border-border bg-surface p-4">
                <Suspense fallback={<div className="h-[300px]" />}>
                  <EquityChart points={demo.equity} unit="usd" balance={demo.balance} height={380} />
                </Suspense>
              </div>
            </div>
          </Reveal>
        </section>

        {/* биржи: тонкая строка со значками (как «Auto-syncs with»), без отдельной плашки */}
        <section className="border-y border-border" aria-label={l.exchanges.title}>
          <Reveal className={`${wrap} flex flex-wrap items-center justify-center gap-x-7 gap-y-3 py-6`}>
            <span className="text-xs font-semibold tracking-[0.12em] text-muted uppercase">{l.exchanges.title}</span>
            <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
              {EXCHANGES.map((x) => (
                <li key={x.id} className="flex items-center gap-2 text-sm font-medium">
                  <span aria-hidden data-ex={x.id} className="ex-badge">
                    {x.mark}
                  </span>
                  {x.name}
                </li>
              ))}
            </ul>
            <span className="text-sm text-muted">{l.exchanges.more}</span>
            <p className="w-full text-center text-xs text-muted">{t.exchange.soon}</p>
          </Reveal>
        </section>

        {/* возможности: путь одной сделки — сделка → «Разбор» → календарь (на широком экране в один ряд) */}
        <section id="features" className={`${wrap} scroll-mt-20 py-16 sm:py-24`}>
          <Reveal as="h2" className="text-3xl font-bold tracking-tight sm:text-4xl">
            {l.path.title}
          </Reveal>
          <ol className="mt-10 grid gap-x-6 gap-y-10 rounded-xl border border-border bg-surface/40 p-4 sm:p-6 lg:grid-cols-3">
            <PathStep n={1} text={l.path.trade.text}>
              <TradeVisual />
            </PathStep>
            <PathStep n={2} text={l.path.analysis.text}>
              <AnalysisVisual />
            </PathStep>
            <PathStep n={3} text={l.path.calendar.text}>
              <CalendarVisual trades={demo.trades} mark={`demo-${DEMO_FEATURED.index}`} />
            </PathStep>
          </ol>
        </section>

        {/* тарифы */}
        <section id="pricing" className={`${wrap} scroll-mt-20 py-16 sm:py-24`}>
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{l.pricingTitle}</h2>
            <p className="mt-3 text-text/90">{l.pricingHint}</p>
          </Reveal>
          <div className="mt-10">
            <PlanCards
              action={(plan) => (
                <Link to="/register" className={`${plan.id === 'pro_plus' ? btnPrimary : btnSecondary} w-full !py-3`}>
                  {l.pick}
                </Link>
              )}
            />
          </div>
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
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text/90">{l.faq.items[k].a}</p>
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
          <div className="flex flex-wrap gap-4">
            <Link to="/privacy" className="hover:text-text">
              {t.privacy.link}
            </Link>
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

function PathStep({ n, text, children }: { n: number; text: string; children: React.ReactNode }) {
  return (
    <Reveal as="li" delay={(n - 1) * 90} className="flex min-w-0 flex-col gap-3">
      <p className="text-sm leading-snug">
        <span className="num mr-2 text-muted">{n}.</span>
        {text}
      </p>
      {children}
    </Reveal>
  )
}

/* ---------- маленькие «скриншоты» из интерфейса ---------- */

function TradeVisual() {
  const t = useT()
  const p = t.landing.path.trade
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{DEMO_FEATURED.symbol}</span>
          <SideBadge side={DEMO_FEATURED.side} />
        </div>
        <span className={`num font-semibold ${pnlClass(DEMO_FEATURED.pnl)}`}>{formatPnl(DEMO_FEATURED.pnl)}</span>
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-t border-border pt-3 text-sm">
        <dt className="text-muted">{p.mistake}</dt>
        <dd>{p.mistakeValue}</dd>
        <dt className="text-muted">{p.emotion}</dt>
        <dd>{p.emotionValue}</dd>
      </dl>
    </div>
  )
}

function AnalysisVisual() {
  const t = useT()
  const f = t.landing.path.analysis
  const rows: [string, number, number, boolean][] = [
    [f.rows.a, 12, -214.4, false],
    [f.rows.b, 9, -906.8, true],
    [f.rows.c, 5, -188.1, false],
  ]
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted">
          <tr>
            <th className="px-3 py-2.5 text-left font-normal">{f.cols.name}</th>
            <th className="px-3 py-2.5 text-right font-normal">{f.cols.trades}</th>
            <th className="px-3 py-2.5 text-right font-normal">{f.cols.pnl}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, n, pnl, hit]) => (
            <tr key={name} className={`border-t border-border ${hit ? 'bg-surface-2 font-semibold' : ''}`}>
              <td className="px-3 py-2.5">{name}</td>
              <td className="num px-3 py-2.5 text-right text-muted">{n}</td>
              <td className={`num px-3 py-2.5 text-right ${pnlClass(pnl)}`}>{formatPnl(pnl)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CalendarVisual({ trades, mark }: { trades: ClosedTrade[]; mark?: string }) {
  const t = useT()
  // месяц той сделки, что в «пути одной сделки» (или последней), — дни из того же демо-счёта, что и дашборд выше
  const at = new Date((trades.find((x) => x.id === mark) ?? trades[trades.length - 1])?.exit_at ?? Date.now())
  const cal = profitCalendar(trades, at.getUTCFullYear(), at.getUTCMonth(), 'UTC')
  const markDate = trades.find((x) => x.id === mark)?.exit_at?.slice(0, 10)
  return (
    <div className="rounded-xl border border-border bg-surface p-3 sm:p-4">
      <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs text-muted sm:gap-1.5">
        {t.period.weekdaysShort.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {cal.weeks.flatMap((w) => w.days).map((d) => {
          const has = d.inMonth && d.count > 0
          const tone = !d.inMonth ? 'cal-hatch border-transparent' : !has ? 'border-border bg-surface-2/50' : d.pnl > 0 ? 'border-up/45 bg-up/18' : 'border-down/45 bg-down/18'
          const ring = d.date === markDate ? 'ring-2 ring-primary' : ''
          return (
            <div key={d.date} className={`relative flex min-h-12 flex-col items-center justify-center rounded-md border px-0.5 pt-3 pb-1 sm:min-h-14 ${tone} ${ring}`}>
              <span className={`absolute top-0.5 right-1 text-xs ${d.inMonth ? 'text-muted' : 'text-muted/60'}`}>{d.day}</span>
              {has && (
                <span className={`num text-xs leading-tight font-semibold ${d.pnl > 0 ? 'text-up' : 'text-down'}`} title={plural(d.count, t.dashboard.calendar.tradesN)}>
                  {compactPnl(d.pnl)}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
