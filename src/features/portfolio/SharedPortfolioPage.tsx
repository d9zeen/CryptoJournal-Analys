/**
 * Портфель по ссылке (/p/:token, 0022) — для всех, без входа. Только то, что разрешил владелец:
 * монеты, доли, изменения, график (без сумм — в процентах к началу); суммы — если включил «Показывать суммы».
 * Внизу — приглашение завести свой портфель. Раскладка как у «Портфеля»: на xl график и «Из чего состоит» рядом.
 */
import { lazy, Suspense, useMemo, type CSSProperties } from 'react'
import { Link, useParams } from 'react-router'
import { useT } from '@/i18n'
import { Logo } from '@/components/Logo'
import { LangSwitch } from '@/components/LangSwitch'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Skeleton } from '@/components/Skeleton'
import { formatPercent, formatUsd, pnlClass } from '@/lib/format'
import { sharedChange24, sharedRows, type SeriesPoint } from '@/lib/calc/portfolio'
import { useSharedPortfolio } from './shareApi'
import { Allocation, Spark } from './PortfolioPage'
import { CoinIcon } from './CoinIcon'

const PortfolioChart = lazy(() => import('./PortfolioChart').then((m) => ({ default: m.PortfolioChart })))
const signedPct = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '') + formatPercent(Math.abs(v), 2)
const btn = 'inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors'

export function SharedPortfolioPage() {
  const t = useT()
  const s = t.portfolio.shared
  const { token } = useParams()
  const { data, isLoading, isError } = useSharedPortfolio(token)
  const rows = useMemo(() => sharedRows(data?.coins ?? []), [data])
  const change = useMemo(() => sharedChange24(data?.coins ?? []), [data])
  const points: SeriesPoint[] = useMemo(() => (data?.history ?? []).map((h) => ({ t: Date.parse(h.t), value: Number(h.v), est: null, btc: null })), [data])
  const amounts = Boolean(data?.show_amounts)

  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-[2200px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/welcome" aria-label={t.app.name}>
            <Logo />
          </Link>
          <div className="flex items-center gap-2">
            <LangSwitch />
            <ThemeToggle className="max-[400px]:hidden" />
          </div>
        </div>
      </header>

      <main data-shared-portfolio className="mx-auto flex w-full max-w-[2200px] flex-col gap-4 px-4 py-6 sm:px-6">
        {isLoading ? (
          <Skeleton className="h-96" />
        ) : !data || isError ? (
          <p data-shared-missing className="mx-auto max-w-md py-16 text-center text-muted">
            {s.notFound}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h1 className="font-display text-xl font-semibold">{s.title}</h1>
                <p className="text-sm text-muted">{amounts ? s.value : s.hidden}</p>
              </div>
              <div className="flex items-baseline gap-3">
                {amounts && data.total !== null && <span className="num text-2xl font-semibold">{formatUsd(data.total)}</span>}
                {change !== null && (
                  <span className={`num text-sm ${pnlClass(change)}`}>
                    {signedPct(change)} <span className="text-muted">· {s.change}</span>
                  </span>
                )}
              </div>
            </div>

            {rows.length === 0 ? (
              <p className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-muted">{s.empty}</p>
            ) : (
              <>
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                  <section style={{ '--i': 1 } as CSSProperties} className="rise flex min-w-0 flex-col rounded-lg border border-border bg-surface p-4 sm:p-5">
                    <h2 className="text-sm font-semibold">
                      {s.chart} {!amounts && <span className="font-normal text-muted">· {s.chartPct}</span>}
                    </h2>
                    <div data-shared-chart className="relative mt-2 min-h-[260px] flex-1">
                      <div className="absolute inset-0">
                        {points.length >= 2 ? (
                          <Suspense fallback={<Skeleton className="h-full" />}>
                            <PortfolioChart points={points} short={false} pct={!amounts} />
                          </Suspense>
                        ) : (
                          <p className="grid h-full place-items-center px-6 text-center text-sm text-muted">{t.portfolio.chart.empty}</p>
                        )}
                      </div>
                    </div>
                  </section>
                  <Allocation rows={rows} />
                </div>

                <section style={{ '--i': 2 } as CSSProperties} className="rise min-w-0 rounded-lg border border-border bg-surface p-4 sm:p-5">
                  <h2 className="text-sm font-semibold">{s.coins}</h2>
                  <ul className="mt-3 flex flex-col divide-y divide-border">
                    {rows.map((r) => (
                      <li key={r.symbol} data-coin={r.symbol} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_96px_96px]">
                        <span className="flex min-w-0 items-center gap-3">
                          <CoinIcon symbol={r.symbol} icon={r.coin?.icon} size={28} />
                          <span className="flex min-w-0 flex-col">
                            <b className="text-sm">{r.symbol}</b>
                            <span className="truncate text-xs text-muted">{r.coin?.name}</span>
                          </span>
                        </span>
                        <span className="hidden items-center gap-2 sm:flex">
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                            <span className="block h-full origin-left rounded-full bg-primary" style={{ transform: `scaleX(${Math.min(1, r.share)})` }} />
                          </span>
                          <span className="num w-14 text-right text-xs text-muted">{formatPercent(r.share)}</span>
                        </span>
                        <span className="hidden sm:block">
                          <Spark coin={r.coin} />
                        </span>
                        {/* с суммами — стоимость и изменение; без сумм — изменение (доля — на полоске; на телефоне полоски нет — доля здесь) */}
                        <span className="flex flex-col items-end">
                          {amounts ? (
                            <span className="num text-sm">{formatUsd(r.value ?? 0)}</span>
                          ) : (
                            <span className="num text-sm sm:hidden">{formatPercent(r.share)}</span>
                          )}
                          <span className={`num ${amounts ? 'text-xs' : 'text-xs sm:text-sm'} ${pnlClass(r.change24)}`}>{r.change24 === null ? '' : signedPct(r.change24 / 100)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              </>
            )}

            <section className="mt-2 flex flex-col items-center gap-3 rounded-lg border border-border bg-surface px-4 py-6 text-center">
              <p className="text-sm text-muted">{s.madeWith}</p>
              <p className="font-display text-lg font-semibold">{s.cta}</p>
              <Link to="/register" className={`${btn} bg-primary text-on-primary hover:bg-primary-hover`}>
                {s.ctaButton}
              </Link>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
