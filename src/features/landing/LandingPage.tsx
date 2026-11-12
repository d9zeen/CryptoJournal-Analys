/**
 * Главная для тех, кто ещё не вошёл: что это, живой дашборд демо-счёта, биржи (по API / файлом), путь одной сделки, тарифы, вопросы.
 * Превью — настоящие виджеты дашборда на выдуманных сделках (demo.ts), а не картинка.
 */
import { Fragment, lazy, Suspense, useMemo, useRef } from 'react'
import { useSpotlight, useTilt } from '@/lib/motion'
import { Link } from 'react-router'
import { fmt, plural, useT } from '@/i18n'
import { Logo, LogoMark } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LangSwitch } from '@/components/LangSwitch'
import { useAuth } from '@/features/auth/AuthProvider'
import { KpiRow } from '@/features/dashboard/Widgets'
import { formatDayShort, formatPnl, pnlClass } from '@/lib/format'
import { Reveal } from './Reveal'
import { SideBadge } from '@/components/SideBadge'
import { PlanCards } from './PlanCards'
import { HeroCandles } from './HeroCandles'
import { DEMO_FEATURED, demoAccount, demoMistakeRows, demoWeek } from './demo'
import { compactPnl } from '@/lib/calc/calendar'
import type { ClosedTrade } from '@/lib/calc/stats'

const EquityChart = lazy(() => import('@/features/dashboard/charts').then((m) => ({ default: m.EquityChart })))

/** Полоса бирж: две честные строки — что подключается само по API и что загружается файлом (названия не переводятся) */
const VIA_API = ['Bybit', 'Hyperliquid', 'Polymarket']
const VIA_FILE = ['Binance', 'OKX', 'BingX', 'Bitget', 'MEXC']
const pill = 'inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-sm font-medium'

const btn = 'inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors'
const btnPrimary = `${btn} bg-primary text-on-primary hover:bg-primary-hover`
const btnSecondary = `${btn} border border-border bg-surface-2 text-text hover:border-muted/60`
const wrap = 'mx-auto w-full max-w-[1320px] px-4 sm:px-6'
/** отступы между блоками главной (были py-16 sm:py-24 — на телефоне главная выходила в 5+ экранов) */
const section = 'py-11 sm:py-16'
const FAQ = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const

export function LandingPage() {
  const t = useT()
  const l = t.landing
  const accentWords = l.titleAccent.split(' ').length
  const demo = useMemo(() => demoAccount(), [])
  const previewRef = useRef<HTMLDivElement>(null)
  useTilt(previewRef, 4)
  const pathRef = useRef<HTMLOListElement>(null)
  useSpotlight(pathRef)
  const { user } = useAuth()

  return (
    <div className="min-h-dvh">
      {/* шапка */}
      <header className="animate-drop sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur">
        <div className={`${wrap} flex h-14 items-center justify-between gap-4`}>
          {/* уже 380px название не помещается рядом с «Начать» — только значок */}
          <Link to="/" aria-label={t.app.name} className="shrink-0">
            <span className="min-[380px]:hidden">
              <LogoMark />
            </span>
            <span className="hidden min-[380px]:block">
              <Logo />
            </span>
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
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <LangSwitch />
            {/* на узких телефонах (до 440px) кнопке темы не хватает места рядом с «Начать» */}
            <span className="hidden min-[440px]:contents">
              <ThemeToggle />
            </span>
            {user ? (
              // уже вошёл (смотрит /welcome) — одна кнопка в дневник
              <Link to="/dashboard" className={`${btnPrimary} !px-3 !py-2`}>
                {l.open}
              </Link>
            ) : (
              <>
                {/* на телефоне в шапке — главная кнопка «Начать»; «Войти» остаётся на первом экране и в подвале */}
                <span className="hidden sm:contents">
                  <Link to="/login" className={`${btnSecondary} !px-3 !py-2 whitespace-nowrap`}>
                    {l.login}
                  </Link>
                </span>
                <Link to="/register" className={`${btnPrimary} !px-3 !py-2 whitespace-nowrap`}>
                  <span className="sm:hidden">{l.startShort}</span>
                  <span className="hidden sm:inline">{l.start}</span>
                </Link>
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
                <p className="mt-4 max-w-xl text-lg leading-snug text-balance text-text/75 sm:text-xl">{l.subtitle}</p>
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
          <Reveal delay={820} zoom className="mt-12">
            {/* №2: превью чуть наклоняется к курсору (только мышь; большой блок — наклон меньше, ±4°) */}
            <div ref={previewRef} className="tilt relative rounded-xl border border-border bg-surface/40 p-2 sm:p-3">
              <span aria-hidden className="tilt-sheen" />
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
            </div>
          </Reveal>
        </section>

        {/* биржи: две строки — «сами по API» (с зелёной точкой) и «файлом»; на телефоне подпись строки над пилюлями */}
        <section className="border-y border-border" aria-label={l.exchanges.title}>
          <Reveal className={`${wrap} flex justify-center py-6`}>
            <dl className="grid gap-x-5 gap-y-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
              <dt className="text-xs font-semibold tracking-[0.12em] text-muted uppercase">{l.exchanges.api}</dt>
              <dd className="-mt-2 flex flex-wrap gap-2 sm:mt-0">
                {VIA_API.map((name) => (
                  <span key={name} className={pill}>
                    <i aria-hidden className="size-1.5 rounded-full bg-up" />
                    {name}
                  </span>
                ))}
              </dd>
              <dt className="text-xs font-semibold tracking-[0.12em] text-muted uppercase">{l.exchanges.file}</dt>
              <dd className="-mt-2 flex flex-wrap gap-2 sm:mt-0">
                {VIA_FILE.map((name) => (
                  <span key={name} className={pill}>
                    {name}
                  </span>
                ))}
                <span className={`${pill} text-muted`}>{l.exchanges.other}</span>
              </dd>
            </dl>
          </Reveal>
        </section>

        {/* возможности: путь одной сделки — сделка → «Разбор» → календарь (на широком экране в один ряд) */}
        <section id="features" className={`${wrap} scroll-mt-20 ${section}`}>
          <Reveal as="h2" className="text-3xl font-bold tracking-tight sm:text-4xl">
            {l.path.title}
          </Reveal>
          <ol ref={pathRef} className="mt-7 grid gap-x-10 gap-y-8 rounded-xl border border-border bg-surface/40 p-4 sm:p-6 lg:grid-cols-3">
            <PathStep n={1} text={l.path.trade.text}>
              <TradeVisual />
            </PathStep>
            <PathStep n={2} text={l.path.analysis.text}>
              <AnalysisVisual trades={demo.trades} featuredId={demo.featuredId} />
            </PathStep>
            <PathStep n={3} text={l.path.calendar.text}>
              <WeekVisual trades={demo.trades} mark={demo.featuredId} />
            </PathStep>
          </ol>
        </section>

        {/* тарифы */}
        <section id="pricing" className={`${wrap} scroll-mt-20 ${section}`}>
          {/* как в образце (Prism UI «Pricing»): заголовок и описание по центру */}
          <Reveal className="mb-8 text-center sm:mb-10">
            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">{l.pricingTitle}</h2>
            <p className="mt-4 text-lg text-muted">{l.pricingHint}</p>
          </Reveal>
          <PlanCards to="/register" label={l.pick} />
        </section>

        {/* вопросы */}
        <section id="faq" className={`scroll-mt-20 border-t border-border ${section}`}>
          <div className={`${wrap} grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]`}>
            <Reveal as="h2" className="text-3xl font-bold tracking-tight sm:text-4xl">
              {l.faq.title}
            </Reveal>
            <div className="divide-y divide-border border-y border-border">
              {FAQ.map((k, i) => (
                <Reveal as="details" key={k} delay={i * 50} className="group py-4">
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
    <Reveal as="li" delay={(n - 1) * 90} className="relative flex min-w-0 flex-col gap-3">
      {/* на широком экране между шагами — тонкая стрелка → (посередине промежутка между колонками) */}
      {n < 3 && (
        <svg viewBox="0 0 16 16" className="absolute top-1/2 -right-7 hidden size-4 text-muted lg:block" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M2 8h12m-4-4l4 4-4 4" />
        </svg>
      )}
      <p className="text-sm leading-snug">
        <span className="num mr-2 text-muted">{n}.</span>
        {text}
      </p>
      {/* №3: рамка и пятно подсветки под курсором (обёртка .spot-frame = рамка 1px) */}
      <div data-spot className="spot-frame rounded-xl">
        {children}
      </div>
    </Reveal>
  )
}

/* ---------- маленькие «скриншоты» из интерфейса ---------- */

function TradeVisual() {
  const t = useT()
  const p = t.landing.path.trade
  return (
    <div className="spot-card rounded-[calc(0.75rem-1px)] bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{DEMO_FEATURED.symbol}</span>
          <SideBadge side={DEMO_FEATURED.side} />
        </div>
        <span className={`num font-semibold ${pnlClass(DEMO_FEATURED.pnl)}`}>{formatPnl(DEMO_FEATURED.pnl)}</span>
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-t border-border pt-3 text-sm">
        <dt className="text-muted">{p.mistake}</dt>
        <dd>{t.landing.path.analysis.rows[DEMO_FEATURED.mistake]}</dd>
        <dt className="text-muted">{p.emotion}</dt>
        <dd>{p.emotionValue}</dd>
      </dl>
    </div>
  )
}

/** Месяц сделки из «пути» (UTC) — его же показывают «Разбор» и календарь */
function featuredMonth(trades: ClosedTrade[], id: string): Date {
  return new Date((trades.find((x) => x.id === id) ?? trades[trades.length - 1])?.exit_at ?? Date.now())
}

function AnalysisVisual({ trades, featuredId }: { trades: ClosedTrade[]; featuredId: string }) {
  const t = useT()
  const f = t.landing.path.analysis
  // считается из тех же демо-сделок, что и календарь рядом: сумма «Вход без стопа» включает сделку из карточки
  const at = featuredMonth(trades, featuredId)
  const rows: [string, number, number, boolean][] = demoMistakeRows(trades, at.getUTCFullYear(), at.getUTCMonth()).map((r) => [
    f.rows[r.key],
    r.count,
    r.pnl,
    r.key === DEMO_FEATURED.mistake,
  ])
  return (
    <div className="spot-card overflow-hidden rounded-[calc(0.75rem-1px)] bg-surface">
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

/** Шаг 3: неделя с этой сделкой — одна строка из 7 дней (день сделки выделен), итог недели и подпись из данных демо */
function WeekVisual({ trades, mark }: { trades: ClosedTrade[]; mark: string }) {
  const t = useT()
  const c = t.landing.path.calendar
  const week = demoWeek(trades, mark)
  const f = week.featured
  return (
    <div className="spot-card rounded-[calc(0.75rem-1px)] bg-surface p-3 sm:p-4">
      <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs text-muted sm:gap-1.5">
        {t.period.weekdaysShort.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {week.days.map((d) => {
          const tone = d.count === 0 ? 'border-border bg-surface-2/50' : d.pnl > 0 ? 'border-up/45 bg-up/18' : 'border-down/45 bg-down/18'
          const ring = d.date === f.date ? 'ring-2 ring-primary' : ''
          return (
            <div
              key={d.date}
              data-day={d.date}
              className={`relative flex min-h-12 flex-col items-center justify-center rounded-md border px-0.5 pt-3 pb-1 sm:min-h-14 ${tone} ${ring}`}
              title={d.count ? `${formatPnl(d.pnl)} · ${plural(d.count, t.dashboard.calendar.tradesN)}` : undefined}
            >
              <span className="absolute top-0.5 right-1 text-xs text-muted">{d.day}</span>
              {d.count > 0 && <span className={`num text-xs leading-tight font-semibold ${d.pnl > 0 ? 'text-up' : 'text-down'}`}>{compactPnl(d.pnl)}</span>}
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-border pt-3 text-sm">
        <span className="text-muted">{c.week}</span>
        <span className="flex items-baseline gap-2">
          <span className="text-xs text-muted">{plural(week.total.count, t.dashboard.calendar.tradesN)}</span>
          <span data-week-total className={`num font-semibold ${pnlClass(week.total.pnl)}`}>
            {formatPnl(week.total.pnl)}
          </span>
        </span>
      </div>
      <p data-caption className="mt-2 text-xs text-muted">
        {fmt(c.caption, { date: formatDayShort(f.date), pnl: formatPnl(f.pnl), trades: plural(f.count, c.trades), mistake: c.mistake[f.mistake] })}
      </p>
    </div>
  )
}
