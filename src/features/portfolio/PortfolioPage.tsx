/**
 * Вкладка «Портфель» (/portfolio, 16.11.2026): что человек держит сейчас и сколько это стоит.
 * Образцы 21st.dev: web3-bento (стоимость крупно, график с линией сравнения, доли), balance-chart (периоды графика),
 * sectors-donut (кольцо с легендой), market-watchlist (мини-график за 7 дней в строке), stock-portfolio-card (карточки на телефоне).
 *
 * Сверху — стоимость, изменение за 24 ч, прибыль и вложено (по ценам входа); на xl рядом график стоимости и кольцо «Из чего состоит»;
 * ниже — таблица монет с иконками (на телефоне — карточки). Балансы бирж приходят сами (api.ts), монеты можно добавить руками.
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { fmt, plural, useT } from '@/i18n'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Skeleton } from '@/components/Skeleton'
import { Shimmer } from '@/components/fx/Shimmer'
import { UpgradeLine } from '@/components/UpgradeLine'
import { AnimatedNumber } from '@/components/AnimatedNumber'
import { useUsage } from '@/features/settings/api'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { exchangeName } from '@/lib/exchanges'
import { formatDuration, formatNumber, formatPercent, formatPnl, formatUsd, formatUsdPrice, pnlClass } from '@/lib/format'
import { parseDecimal } from '@/lib/parse'
import { dbErrorMessage } from '@/lib/errors'
import {
  DUST_USD,
  allocation,
  costBasis,
  realizedTotal,
  movers,
  portfolioRows,
  portfolioSeries,
  estimateHistory,
  portfolioTotals,
  type Coin,
  type PortfolioRange,
  type PortfolioRow,
} from '@/lib/calc/portfolio'
import type { Connection } from '@/features/connections/api'
import {
  useAddManual,
  useAutoRefreshPortfolio,
  useCoins,
  useCosts,
  useDeleteManual,
  useHoldings,
  usePortfolioConnections,
  useRefreshPortfolio,
  useRefreshing,
  useSetCost,
  useSnapshots,
  useSpotFills,
} from './api'
import { CoinIcon } from './CoinIcon'
import { ShareDialog } from './ShareDialog'

const PortfolioChart = lazy(() => import('./PortfolioChart').then((m) => ({ default: m.PortfolioChart })))

const RANGES: PortfolioRange[] = ['24h', '7d', '1m', '3m', '1y', 'all']
/**
 * Цвет доли в кольце — цвет самой монеты (из её логотипа: BTC оранжевый, USDT зелёный…, считает prices-worker).
 * Цвета нет — запасные в тон сайта; «Другое» — серый
 */
const sliceColor = (s: { symbol: string | null; color: string | null }, i: number) => (s.symbol === null ? SLICE[5] : (s.color ?? SLICE[i % 5]))
const SLICE = ['var(--color-primary)', 'var(--color-accent)', 'var(--color-muted)', 'color-mix(in srgb, var(--color-primary) 45%, var(--color-surface))', 'color-mix(in srgb, var(--color-accent) 40%, var(--color-surface))', 'var(--color-border)']

export function PortfolioPage() {
  const t = useT()
  const p = t.portfolio
  const { data: coins = [], isLoading: coinsLoading } = useCoins()
  const { data: holdings, isLoading } = useHoldings()
  const { data: costs = {} } = useCosts()
  // этап 2: средняя цена входа и зафиксированная прибыль — из истории спотовых покупок / продаж на биржах
  const { data: fills = [] } = useSpotFills()
  const basis = useMemo(() => costBasis(fills), [fills])
  const realized = useMemo(() => realizedTotal(basis), [basis])
  const { data: snaps = [] } = useSnapshots()
  const { conns, all } = usePortfolioConnections()
  const { data: usage } = useUsage()
  const refresh = useRefreshPortfolio()
  const refreshing = useRefreshing()
  useAutoRefreshPortfolio(holdings)

  const [source, setSource] = useState<string | null>(null)
  const [range, setRange] = useState<PortfolioRange>('1m')
  const [hideDust, setHideDust] = useState(true)
  const [adding, setAdding] = useState(false)
  const [sharing, setSharing] = useState(false)

  const list = holdings ?? []
  const rows = useMemo(() => portfolioRows(list, coins, costs, source, basis), [list, coins, costs, source, basis])
  const totals = useMemo(() => portfolioTotals(rows), [rows])
  // график — по всему портфелю (снимки пишутся целиком), фильтр источника влияет на таблицу и цифры
  const allTotals = useMemo(() => portfolioTotals(portfolioRows(list, coins, costs, null, basis)), [list, coins, costs, basis])
  const btcPrice = useMemo(() => coins.find((c) => c.symbol === 'BTC')?.price ?? null, [coins])
  // до первых снимков — оценка по нынешнему составу (все монеты, без фильтра по источнику — как и снимки)
  const estimate = useMemo(() => estimateHistory(portfolioRows(list, coins, costs, null, basis), coins, Date.now()), [list, coins, costs, basis])
  const series = useMemo(() => portfolioSeries(snaps, range, Date.now(), { value: allTotals.value, btcPrice }, estimate), [snaps, range, allTotals.value, btcPrice, estimate])
  const hasEstimate = series.some((x) => x.value === null)
  const shown = hideDust ? rows.filter((r) => r.value !== null && r.value >= DUST_USD) : rows
  const dust = rows.length - shown.length
  const failed = refresh.data?.failed ?? []

  // источники для фильтра: подключения, у которых есть балансы, и «вручную»
  const sources = useMemo(() => {
    const ids = new Set(list.map((h) => h.connection_id))
    const out: { id: string | null; label: string }[] = []
    for (const c of all) if (ids.has(c.id)) out.push({ id: c.id, label: [exchangeName(c.exchange, ''), c.label].filter(Boolean).join(' · ') })
    if (ids.has(null)) out.push({ id: 'manual', label: p.manual })
    return out
  }, [list, all, p.manual])

  const newest = Math.max(0, ...list.filter((h) => h.connection_id).map((h) => Date.parse(h.updated_at)))
  const ago = newest ? Date.now() - newest : null

  if (isLoading || coinsLoading) return <PortfolioSkeleton />

  if (!list.length && !conns.length)
    return (
      <div className="mx-auto w-full max-w-[2200px]">
        <EmptyState basic={usage?.plan === 'free'} onAdd={() => setAdding(true)} />
        {adding && <AddCoinDialog coins={coins} onClose={() => setAdding(false)} />}
      </div>
    )

  return (
    <div data-portfolio className="mx-auto flex w-full max-w-[2200px] flex-col gap-4">
      {/* шапка: заголовок, когда обновлено, источники, «Обновить» и «Добавить монету» */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-display text-xl font-semibold">{p.title}</h1>
          <p className="text-sm text-muted">
            {refreshing ? <Shimmer>{p.refreshing}</Shimmer> : ago === null ? (conns.length ? p.never : p.manual) : ago < 60_000 ? p.updatedNow : fmt(p.updated, { ago: formatDuration(ago) })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sources.length > 1 && (
            <div role="radiogroup" aria-label={p.sourcesLabel} className="flex max-w-full overflow-x-auto rounded-full border border-border bg-surface p-1">
              {[{ id: null, label: p.all }, ...sources].map((s) => (
                <button
                  key={s.id ?? 'all'}
                  type="button"
                  role="radio"
                  aria-checked={source === s.id}
                  onClick={() => setSource(s.id)}
                  className={`shrink-0 rounded-full px-3 py-1 text-sm whitespace-nowrap transition-colors ${source === s.id ? 'bg-surface-2 font-medium text-text' : 'text-muted hover:text-text'}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
          {conns.length > 0 && (
            <Button variant="secondary" onClick={() => refresh.mutate()} disabled={refreshing}>
              {p.refresh}
            </Button>
          )}
          <Button variant="secondary" onClick={() => setSharing(true)}>
            {p.share.button}
          </Button>
          <Button onClick={() => setAdding(true)}>{p.add}</Button>
        </div>
      </div>
      {sharing && <ShareDialog onClose={() => setSharing(false)} />}

      {failed.length > 0 && (
        <p data-portfolio-failed className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-muted">
          {fmt(p.failed, { names: failed.map((f) => exchangeName(all.find((c) => c.id === f.id)?.exchange ?? '', '')).join(', ') })}
        </p>
      )}
      {coins.length === 0 && <p className="text-sm text-muted">{p.pricesPending}</p>}

      <Kpis totals={totals} realized={fills.length ? realized : null} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section style={{ '--i': 4 } as CSSProperties} className="rise flex min-w-0 flex-col rounded-lg border border-border bg-surface p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">{p.chart.title}</h2>
            <div role="radiogroup" aria-label={p.chart.rangesLabel} className="flex rounded-full border border-border bg-surface-2/60 p-0.5">
              {RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={range === r}
                  onClick={() => setRange(r)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${range === r ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text'}`}
                >
                  {p.chart.ranges[r]}
                </button>
              ))}
            </div>
          </div>
          {/* одна сплошная линия, как кривая капитала в «Статистике»; оценка до первого снимка — подписью, без пунктира */}
          {hasEstimate && (
            <p data-chart-estimate className="mt-2 text-xs text-muted">
              {p.chart.estimateNote}
            </p>
          )}
          {/* график занимает всю высоту карточки (на xl — вровень с «Из чего состоит»), не ниже 260px */}
          <div data-portfolio-chart className="relative mt-2 min-h-[260px] flex-1">
            <div className="absolute inset-0">
              {series.length >= 2 ? (
                <Suspense fallback={<Skeleton className="h-full" />}>
                  <PortfolioChart points={series} short={range === '24h'} drawKey={range} />
                </Suspense>
              ) : (
                <p className="grid h-full place-items-center px-6 text-center text-sm text-muted">{p.chart.empty}</p>
              )}
            </div>
          </div>
        </section>

        <Allocation rows={rows} />
      </div>

      <section style={{ '--i': 6 } as CSSProperties} className="rise min-w-0 rounded-lg border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">{p.table.title}</h2>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
            <input type="checkbox" role="switch" checked={hideDust} onChange={(e) => setHideDust(e.target.checked)} className="peer sr-only" />
            <span aria-hidden className="relative h-5 w-9 rounded-full bg-surface-2 transition-colors peer-checked:bg-primary peer-focus-visible:outline-2 peer-focus-visible:outline-primary after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-surface after:transition-transform peer-checked:after:translate-x-4" />
            {p.table.hideDust}
          </label>
        </div>
        <CoinTable rows={shown} conns={all} costs={costs} />
        {dust > 0 && <p className="mt-3 text-xs text-muted">{plural(dust, p.table.dustHidden)}</p>}
      </section>

      {adding && <AddCoinDialog coins={coins} onClose={() => setAdding(false)} />}
    </div>
  )
}

function Kpis({ totals, realized }: { totals: ReturnType<typeof portfolioTotals>; realized: number | null }) {
  const t = useT()
  const k = t.portfolio.kpi
  const card = 'rise flex min-w-0 flex-col gap-1 rounded-lg border bg-surface p-4'
  return (
    <div data-portfolio-kpis className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div style={{ '--i': 0 } as CSSProperties} className={`${card} border-primary`}>
        <span className="text-xs text-muted">{k.value}</span>
        <AnimatedNumber value={totals.value} format={formatUsd} className="num text-2xl font-semibold sm:text-3xl" />
        <span className="text-xs text-muted">
          {plural(totals.priced, k.coins)}
          {totals.unpriced > 0 && ` · ${fmt(k.noPrice, { n: totals.unpriced })}`}
        </span>
      </div>
      <div style={{ '--i': 1 } as CSSProperties} className={`${card} border-border`}>
        <span className="text-xs text-muted">{k.change}</span>
        <span className={`num text-2xl font-semibold ${pnlClass(totals.change24Usd)}`}>{formatPnl(totals.change24Usd)}</span>
        <span className={`num text-xs ${pnlClass(totals.change24)}`}>{totals.change24 === null ? '—' : signedPct(totals.change24)}</span>
      </div>
      <div style={{ '--i': 2 } as CSSProperties} className={`${card} border-border`}>
        <span className="text-xs text-muted">{k.pnl}</span>
        <span className={`num text-2xl font-semibold ${totals.withCost ? pnlClass(totals.pnl) : 'text-muted'}`}>{totals.withCost ? formatPnl(totals.pnl) : '—'}</span>
        <span className="text-xs text-muted">
          {totals.withCost ? (
            <>
              <span className={`num ${pnlClass(totals.pnlPct)}`}>{totals.pnlPct === null ? '' : `${signedPct(totals.pnlPct)} · `}</span>
              {fmt(k.investedShort, { v: formatUsd(totals.invested) })} · {fmt(k.pnlHint, { n: totals.withCost, total: totals.priced })}
            </>
          ) : (
            k.pnlNone
          )}
        </span>
      </div>
      {/* этап 2: прибыль, зафиксированная продажами (из истории спотовых сделок на биржах) */}
      <div data-kpi-realized style={{ '--i': 3 } as CSSProperties} className={`${card} border-border`}>
        <span className="text-xs text-muted">{k.realized}</span>
        <span className={`num text-2xl font-semibold ${realized === null ? 'text-muted' : pnlClass(realized)}`}>{realized === null ? '—' : formatPnl(realized)}</span>
        <span className="text-xs text-muted">{realized === null ? k.realizedNone : k.realizedHint}</span>
      </div>
    </div>
  )
}

const signedPct = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '') + formatPercent(Math.abs(v), 2)

/** Кольцо долей + легенда + лучшая / худшая монета за 24 ч (образец — 21st.dev sectors-donut) */
export function Allocation({ rows }: { rows: PortfolioRow[] }) {
  const t = useT()
  const a = t.portfolio.alloc
  const parts = allocation(rows, 5)
  const m = movers(rows)
  const R = 54
  const C = 2 * Math.PI * R
  let off = 0
  return (
    <section data-portfolio-alloc style={{ '--i': 5 } as CSSProperties} className="rise flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
      <h2 className="text-sm font-semibold">{a.title}</h2>
      <div className="flex flex-col items-center gap-5 sm:flex-row">
        <svg viewBox="0 0 136 136" className="size-36 shrink-0" aria-hidden>
          <circle cx="68" cy="68" r={R} fill="none" stroke="var(--color-surface-2)" strokeWidth="12" />
          {parts.map((s, i) => {
            const len = C * s.share
            const gap = parts.length > 1 ? Math.min(3, len / 3) : 0
            const el = (
              <circle
                key={s.symbol ?? 'other'}
                cx="68"
                cy="68"
                r={R}
                fill="none"
                stroke={sliceColor(s, i)}
                strokeWidth="12"
                strokeDasharray={`${Math.max(0, len - gap)} ${C}`}
                strokeDashoffset={-off}
                transform="rotate(-90 68 68)"
              />
            )
            off += len
            return el
          })}
        </svg>
        <ul className="grid w-full min-w-0 gap-2 text-sm">
          {parts.map((s, i) => (
            <li key={s.symbol ?? 'other'} className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-2">
              <i aria-hidden className="size-2.5 rounded-[3px]" style={{ background: sliceColor(s, i) }} />
              <span className="truncate">{s.symbol ?? a.other}</span>
              <span className="num text-muted">{formatPercent(s.share)}</span>
            </li>
          ))}
        </ul>
      </div>
      {(m.best || m.worst) && (
        <div className="mt-auto grid grid-cols-2 gap-2">
          {[
            { row: m.best, label: a.best },
            { row: m.worst, label: a.worst },
          ].map(({ row, label }) => (
            <div key={label} className="flex min-w-0 flex-col gap-1 rounded-lg bg-surface-2/60 px-3 py-2.5">
              <span className="text-xs text-muted">{label}</span>
              {row ? (
                <span className="flex min-w-0 items-center gap-2">
                  <CoinIcon symbol={row.symbol} icon={row.coin?.icon} size={20} />
                  <b className="truncate text-sm">{row.symbol}</b>
                  <span className={`num ml-auto text-sm ${pnlClass(row.change24)}`}>{signedPct((row.change24 ?? 0) / 100)}</span>
                </span>
              ) : (
                <span className="text-sm text-muted">—</span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/** Мини-график цены за 7 дней (из coins.spark), цвет — по итогу недели */
export function Spark({ coin }: { coin: Coin | null }) {
  const pts = coin?.spark ?? []
  if (pts.length < 2) return <span className="text-muted">—</span>
  const lo = Math.min(...pts)
  const hi = Math.max(...pts)
  // размах не меньше 2 % цены: у стейблкоина копеечные колебания не превращаются в «пилу»
  const span = Math.max(hi - lo, ((hi + lo) / 2) * 0.02) || 1
  const base = lo - (span - (hi - lo)) / 2
  const d = pts.map((v, i) => `${((i / (pts.length - 1)) * 72).toFixed(1)},${(22 - ((v - base) / span) * 20).toFixed(1)}`).join(' ')
  const up = pts[pts.length - 1] >= pts[0]
  return (
    <svg viewBox="0 0 72 24" className="inline-block h-6 w-[72px]" aria-hidden>
      <polyline fill="none" stroke={up ? 'var(--color-up)' : 'var(--color-down)'} strokeWidth="1.6" strokeLinejoin="round" points={d} />
    </svg>
  )
}

/** Откуда монета: биржи (и счета — в подсказке) и «вручную» */
/**
 * Подпись счёта. У Bybit и OKX «spot» — это единый торговый счёт (спот и фьючерсы вместе, сумма — с прибылью открытых позиций),
 * поэтому так и пишем: иначе «спот: 12 983 USDT» путает, а сумма «плавает» из-за открытых позиций.
 */
function accountLabel(p: ReturnType<typeof useT>['portfolio'], exchange: string | undefined, account: string): string {
  if (account === 'spot' && (exchange === 'bybit' || exchange === 'okx')) return p.accounts.unified
  return p.accounts[account as keyof typeof p.accounts] ?? account
}

function Sources({ row, conns }: { row: PortfolioRow; conns: Connection[] }) {
  const t = useT()
  const p = t.portfolio
  return (
    <span className="flex flex-wrap gap-1">
      {row.sources.map((id) => {
        const c = conns.find((x) => x.id === id)
        const label = id === null ? p.manual : c ? exchangeName(c.exchange, '') : '?'
        const detail = row.holdings
          .filter((h) => h.connection_id === id)
          .map((h) => `${accountLabel(p, c?.exchange, h.account)}: ${formatNumber(h.amount, 8)}${h.note ? ` (${h.note})` : ''}`)
          .join(', ')
        return (
          <span key={id ?? 'manual'} title={detail} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs whitespace-nowrap text-muted">
            {label}
          </span>
        )
      })}
    </span>
  )
}

/** Название монеты (Polymarket — «Позиции Polymarket») */
function coinName(row: PortfolioRow, polymarket: string) {
  return row.symbol === 'POLYMARKET' ? polymarket : (row.coin?.name ?? row.symbol)
}

function CoinTable({ rows, conns, costs }: { rows: PortfolioRow[]; conns: Connection[]; costs: Record<string, number> }) {
  const t = useT()
  const p = t.portfolio
  const c = p.table
  const wide = useMediaQuery('(min-width: 1024px)')
  const [editing, setEditing] = useState<string | null>(null)
  const [removing, setRemoving] = useState<PortfolioRow | null>(null)
  const del = useDeleteManual()

  const avgTitle = (r: PortfolioRow) =>
    r.avgSource === 'trades' && r.covered !== null && r.covered < 0.995
      ? fmt(c.covered, { p: formatPercent(r.covered, 0) })
      : r.avgSource === 'stable'
        ? c.stable
        : r.avgSource
          ? c.avgFrom[r.avgSource]
          : undefined
  const avgCell = (r: PortfolioRow) =>
    editing === r.symbol ? (
      <CostEditor symbol={r.symbol} initial={costs[r.symbol] ?? null} onDone={() => setEditing(null)} />
    ) : r.value === null && r.price === null && r.symbol === 'POLYMARKET' ? (
      <span className="text-muted">—</span>
    ) : (
      <button
        type="button"
        data-avg-source={r.avgSource ?? 'none'}
        onClick={() => setEditing(r.symbol)}
        title={avgTitle(r)}
        className={`inline-flex flex-col items-end rounded-md px-1.5 py-0.5 transition-colors hover:bg-surface-2 ${r.avgPrice === null ? 'text-primary' : r.avgSource === 'stable' ? 'text-muted' : ''}`}
      >
        <span className="num">{r.avgPrice === null ? c.setAvg : formatUsdPrice(r.avgPrice)}</span>
        {/* откуда цена: «по сделкам» (история покупок на биржах) / «вручную» */}
        {(r.avgSource === 'trades' || r.avgSource === 'manual') && <span className="text-xs text-muted">{c.avgFrom[r.avgSource]}</span>}
      </button>
    )

  const removeBtn = (r: PortfolioRow) =>
    r.sources.includes(null) ? (
      <button type="button" onClick={() => setRemoving(r)} aria-label={`${c.remove} ${r.symbol}`} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-down">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
        </svg>
      </button>
    ) : null

  const confirm = (
    <ConfirmDialog
      open={removing !== null}
      title={fmt(c.removeTitle, { symbol: removing?.symbol ?? '' })}
      confirm={c.remove}
      cancel={p.dialog.cancel}
      loading={del.isPending}
      onConfirm={async () => {
        for (const h of removing?.holdings.filter((x) => x.connection_id === null) ?? []) await del.mutateAsync(h.id)
        setRemoving(null)
      }}
      onClose={() => setRemoving(null)}
    >
      <p className="text-sm text-muted">{c.removeText}</p>
    </ConfirmDialog>
  )

  if (!wide)
    return (
      <>
        <ul data-portfolio-cards className="mt-3 divide-y divide-border">
          {rows.map((r) => (
            <li key={r.symbol} data-coin={r.symbol} className="flex flex-col gap-2 py-3">
              <div className="flex items-center gap-3">
                <CoinIcon symbol={r.symbol} icon={r.coin?.icon} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{r.symbol}</div>
                  <div className="truncate text-xs text-muted">{coinName(r, p.polymarket)}</div>
                </div>
                <div className="text-right">
                  <div className="num font-semibold">{r.value === null ? c.noPrice : formatUsd(r.value)}</div>
                  <div className="num text-xs text-muted">{r.symbol === 'POLYMARKET' ? '' : `${formatNumber(r.amount, 8)} ${r.symbol}`}</div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pl-11 text-xs">
                <span className="num text-muted">
                  {formatUsdPrice(r.price)} <span className={pnlClass(r.change24)}>{r.change24 === null ? '' : signedPct(r.change24 / 100)}</span>
                </span>
                <span className="flex items-center gap-1 text-muted">
                  {c.avg}: {avgCell(r)}
                </span>
                {r.pnl !== null && (
                  <span className={`num ${pnlClass(r.pnl)}`}>
                    {formatPnl(r.pnl)} {r.pnlPct !== null && `(${signedPct(r.pnlPct)})`}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Sources row={r} conns={conns} />
                  {removeBtn(r)}
                </span>
              </div>
            </li>
          ))}
        </ul>
        {confirm}
      </>
    )

  const th = 'px-3 py-2 text-right text-xs font-semibold whitespace-nowrap text-muted'
  const thLeft = 'px-3 py-2 text-left text-xs font-semibold whitespace-nowrap text-muted'
  return (
    <div className="mt-3 overflow-x-auto">
      <table data-portfolio-table className="w-full min-w-[960px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className={thLeft}>{c.coin}</th>
            <th className={th}>{c.price}</th>
            <th className={th}>{c.week}</th>
            <th className={th}>{c.avg}</th>
            <th className={th}>{c.invested}</th>
            <th className={th}>{c.pnl}</th>
            <th className={th}>{c.holdings}</th>
            <th className={thLeft}>{c.where}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.symbol} data-coin={r.symbol} className="border-b border-border last:border-0 hover:bg-surface-2/40">
              <td className="px-3 py-3">
                <div className="flex items-center gap-3">
                  <CoinIcon symbol={r.symbol} icon={r.coin?.icon} />
                  <div className="min-w-0">
                    <div className="font-semibold">{r.symbol}</div>
                    <div className="max-w-44 truncate text-xs text-muted">{coinName(r, p.polymarket)}</div>
                  </div>
                </div>
              </td>
              <td className="px-3 py-3 text-right">
                {r.price === null ? (
                  <span className="text-xs text-muted" title={r.symbol === 'POLYMARKET' ? undefined : c.noPriceHint}>
                    {r.symbol === 'POLYMARKET' ? '—' : c.noPrice}
                  </span>
                ) : (
                  <>
                    <div className="num">{formatUsdPrice(r.price)}</div>
                    <div className={`num text-xs ${pnlClass(r.change24)}`}>{r.change24 === null ? '—' : signedPct(r.change24 / 100)}</div>
                  </>
                )}
              </td>
              <td className="px-3 py-3 text-right">
                <Spark coin={r.coin} />
              </td>
              <td className="px-3 py-3 text-right">{avgCell(r)}</td>
              <td className="num px-3 py-3 text-right">{r.invested === null ? <span className="text-muted">—</span> : formatUsd(r.invested)}</td>
              <td className="px-3 py-3 text-right">
                {r.pnl === null ? (
                  <span className="text-muted">—</span>
                ) : (
                  <>
                    <div className={`num ${pnlClass(r.pnl)}`}>{formatPnl(r.pnl)}</div>
                    <div className={`num text-xs ${pnlClass(r.pnlPct)}`}>{r.pnlPct === null ? '' : signedPct(r.pnlPct)}</div>
                  </>
                )}
              </td>
              <td className="px-3 py-3 text-right">
                <div className="num font-semibold">{r.value === null ? '—' : formatUsd(r.value)}</div>
                <div className="num text-xs text-muted">
                  {r.symbol === 'POLYMARKET' ? `${c.share} ${formatPercent(r.share)}` : `${formatNumber(r.amount, 8)} ${r.symbol}`}
                </div>
              </td>
              <td className="px-3 py-3">
                <span className="flex items-center gap-1">
                  <Sources row={r} conns={conns} />
                  {removeBtn(r)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {confirm}
    </div>
  )
}

/** Цена входа: поле прямо в ячейке («Сохранить» / «Убрать», Esc — отмена) */
function CostEditor({ symbol, initial, onDone }: { symbol: string; initial: number | null; onDone: () => void }) {
  const t = useT()
  const c = t.portfolio.table
  const set = useSetCost()
  const [value, setValue] = useState(initial === null ? '' : String(initial))
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => ref.current?.focus(), [])
  const num = parseDecimal(value)
  const save = async () => {
    if (num === null || num <= 0) return
    await set.mutateAsync({ symbol, avgPrice: num })
    onDone()
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
      onKeyDown={(e) => e.key === 'Escape' && onDone()}
      className="inline-flex items-center gap-1"
    >
      <input
        ref={ref}
        inputMode="decimal"
        aria-label={fmt(c.avgLabel, { symbol })}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="num w-24 rounded-md border border-border bg-surface-2 px-2 py-1 text-right text-sm focus:border-primary focus:outline-none"
      />
      <button type="submit" disabled={num === null || num <= 0 || set.isPending} className="rounded-md px-2 py-1 text-xs font-semibold text-primary hover:bg-surface-2 disabled:opacity-50">
        {c.save}
      </button>
      {initial !== null && (
        <button
          type="button"
          onClick={async () => {
            await set.mutateAsync({ symbol, avgPrice: null })
            onDone()
          }}
          className="rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-2"
        >
          {c.clear}
        </button>
      )}
    </form>
  )
}

/** Добавить монету вручную: поиск по 500 крупнейшим (символ или название), количество, где лежит */
function AddCoinDialog({ coins, onClose }: { coins: Coin[]; onClose: () => void }) {
  const t = useT()
  const d = t.portfolio.dialog
  const ref = useRef<HTMLDialogElement>(null)
  const add = useAddManual()
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Coin | null>(null)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  useEffect(() => {
    const el = ref.current
    if (el && !el.open) el.showModal()
  }, [])
  const q = query.trim().toLowerCase()
  const found = q ? coins.filter((c) => c.symbol.toLowerCase().startsWith(q) || c.name.toLowerCase().includes(q)).slice(0, 8) : coins.slice(0, 8)
  const qty = parseDecimal(amount)
  const close = () => ref.current?.close()
  return (
    <dialog
      ref={ref}
      data-add-coin
      aria-labelledby="add-coin-title"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && close()}
      className="day-sheet mx-0 mt-auto mb-0 max-h-[88dvh] w-full max-w-none rounded-t-2xl border border-border bg-surface p-0 text-text shadow-2xl backdrop:bg-bg/60 md:m-auto md:max-w-md md:rounded-2xl"
    >
      <form
        className="flex flex-col gap-4 p-5"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!picked || qty === null || qty <= 0) return
          await add.mutateAsync({ symbol: picked.symbol, amount: qty, note: note.trim() || null })
          close()
        }}
      >
        <h2 id="add-coin-title" className="text-lg font-semibold">
          {d.title}
        </h2>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">{d.coin}</span>
          <input
            value={picked ? `${picked.symbol} · ${picked.name}` : query}
            onChange={(e) => {
              setPicked(null)
              setQuery(e.target.value)
            }}
            placeholder={d.search}
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 focus:border-primary focus:outline-none"
          />
        </label>
        {!picked && (
          <ul className="-mt-2 flex max-h-56 flex-col overflow-y-auto rounded-lg border border-border">
            {found.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setPicked(c)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface-2">
                  <CoinIcon symbol={c.symbol} icon={c.icon} size={24} />
                  <b>{c.symbol}</b>
                  <span className="truncate text-muted">{c.name}</span>
                  <span className="num ml-auto text-xs text-muted">{c.price === null ? '' : formatUsdPrice(c.price)}</span>
                </button>
              </li>
            ))}
            {found.length === 0 && <li className="px-3 py-2 text-sm text-muted">{d.notFound}</li>}
          </ul>
        )}
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">{d.amount}</span>
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="num rounded-lg border border-border bg-surface-2 px-3 py-2 focus:border-primary focus:outline-none" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">{d.note}</span>
          <input maxLength={100} value={note} onChange={(e) => setNote(e.target.value)} placeholder={d.notePlaceholder} className="rounded-lg border border-border bg-surface-2 px-3 py-2 focus:border-primary focus:outline-none" />
        </label>
        {add.error && <p className="text-sm text-down">{dbErrorMessage(add.error, t)}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={close}>
            {d.cancel}
          </Button>
          <Button type="submit" loading={add.isPending} disabled={!picked || qty === null || qty <= 0}>
            {d.save}
          </Button>
        </div>
        {!picked && query && <p className="text-xs text-muted">{d.pick}</p>}
      </form>
    </dialog>
  )
}

function EmptyState({ basic, onAdd }: { basic: boolean; onAdd: () => void }) {
  const t = useT()
  const e = t.portfolio.empty
  return (
    <section data-portfolio-empty className="rise flex flex-col items-start gap-4 rounded-lg border border-border bg-surface p-6 sm:p-8">
      <h1 className="font-display text-xl font-semibold">{e.title}</h1>
      <p className="max-w-2xl text-sm text-muted">{e.text}</p>
      <div className="flex flex-wrap gap-2">
        <Link to="/import" className="inline-flex items-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary hover:bg-primary-hover">
          {e.connect}
        </Link>
        <Button variant="secondary" onClick={onAdd}>
          {e.add}
        </Button>
      </div>
      {basic && <UpgradeLine text={t.portfolio.upgrade} />}
    </section>
  )
}

function PortfolioSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[2200px] flex-col gap-4">
      <Skeleton className="h-10 w-48" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
      <Skeleton className="h-96" />
    </div>
  )
}
