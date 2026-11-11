import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { fmt, useT } from '@/i18n'
import { SideBadge } from '@/components/SideBadge'
import { RollNumber } from '@/components/RollNumber'
import { TradesSkeleton } from '@/components/Skeleton'
import { useArrivals } from '@/lib/arrivals'
import { UpgradeLine } from '@/components/UpgradeLine'
import { useTrades } from './api'
import { applyFilters, EMPTY_FILTERS, hasActiveFilters, type TradeFilters } from './filters'
import { useList, useUsage } from '@/features/settings/api'
import { PeriodFilter } from '@/components/PeriodFilter'
import { rangeFor, type CustomRange, type PeriodPreset } from '@/lib/period'
import { SelectField, TextField } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import { EXCHANGES, exchangeName } from '@/lib/exchanges'
import { formatDateTime, formatPnl, formatPrice, formatR, formatUsd, pnlClass } from '@/lib/format'
import type { TradeWithTags } from '@/types/db'
import { useMediaQuery } from '@/lib/useMediaQuery'

/** Сколько сделок рисуем за раз: тысячи строк сразу тормозят браузер */
const PAGE = 100

export function TradesPage() {
  const t = useT()
  const navigate = useNavigate()
  // по умолчанию — всё время: иначе импортированная история за прошлые месяцы «пропадает».
  // ?day=YYYY-MM-DD (клик по дню в календаре) — сразу «свой диапазон» на этот день
  const [params] = useSearchParams()
  const day = /^\d{4}-\d{2}-\d{2}$/.test(params.get('day') ?? '') ? params.get('day')! : null
  const [preset, setPreset] = useState<PeriodPreset>(day ? 'custom' : 'all')
  const [custom, setCustom] = useState<CustomRange>(day ? { from: day, to: day } : { from: '', to: '' })
  const [filters, setFilters] = useState<TradeFilters>(EMPTY_FILTERS)
  const [showFilters, setShowFilters] = useState(false)

  const range = useMemo(() => rangeFor(preset, custom), [preset, custom])
  const { data: trades, isLoading, error, isPlaceholderData } = useTrades(range)
  const ready = !isLoading && !isPlaceholderData
  const periodKey = `${preset}|${custom.from}|${custom.to}`
  // №13: итоги прокручиваются при смене периода (ключ — период, чьи сделки уже на экране)
  const shownKey = useRef(periodKey)
  if (ready) shownKey.current = periodKey
  // №12: сделки, пришедшие от синхронизации с биржей, пока страница открыта, — раздвигают список и вспыхивают
  const ids = useMemo(() => trades?.map((tr) => tr.id), [trades])
  const fresh = useArrivals(ids, ready, periodKey)
  const { data: setups = [] } = useList('setups')
  const { data: tags = [] } = useList('mistake_tags')
  const { data: usage } = useUsage()

  const filtered = useMemo(() => applyFilters(trades ?? [], filters), [trades, filters])
  const [shown, setShown] = useState(PAGE)
  useEffect(() => setShown(PAGE), [preset, custom, filters])
  const visible = filtered.slice(0, shown)
  const desktop = useMediaQuery('(min-width: 768px)')
  const setupName = useMemo(() => new Map(setups.map((s) => [s.id, s.name])), [setups])
  const closed = filtered.filter((tr) => tr.pnl !== null)
  const openCount = filtered.length - closed.length
  const totalPnl = closed.reduce((sum, tr) => sum + Number(tr.pnl), 0)
  const set = <K extends keyof TradeFilters>(k: K, v: TradeFilters[K]) => setFilters((f) => ({ ...f, [k]: v }))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t.trades.title}</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => navigate('/import')}>
            {t.trades.importFile}
          </Button>
          <Button onClick={() => navigate('/trades/new')}>+ {t.trades.add}</Button>
        </div>
      </div>

      {usage && usage.trade_limit !== null && (
        <p className={`text-sm ${usage.trades_created >= usage.trade_limit ? 'text-loss' : 'text-muted'}`}>
          {fmt(t.tradeForm.usage, { used: usage.trades_created, limit: usage.trade_limit, plan: t.plans.names[usage.plan] })}
        </p>
      )}
      {usage && usage.trade_limit !== null && usage.trades_created >= usage.trade_limit && <UpgradeLine text={t.plans.upgrade.trades} />}

      <div className="flex flex-wrap items-center gap-2">
        <PeriodFilter preset={preset} custom={custom} onPreset={setPreset} onCustom={setCustom} />
        <Button variant="secondary" className="py-1.5" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
          {t.trades.filters.show}
          {hasActiveFilters(filters) && <span className="size-2 rounded-full bg-primary" />}
        </Button>
        {hasActiveFilters(filters) && (
          <Button variant="ghost" className="py-1.5" onClick={() => setFilters(EMPTY_FILTERS)}>
            {t.trades.filters.reset}
          </Button>
        )}
      </div>

      {showFilters && (
        <Card className="grid grid-cols-2 gap-3 !p-4 md:grid-cols-6">
          <TextField
            label={t.trades.filters.symbol}
            placeholder={t.trades.filters.symbolPlaceholder}
            value={filters.symbol}
            onChange={(e) => set('symbol', e.target.value)}
          />
          <SelectField label={t.trades.filters.exchange} value={filters.exchange} onChange={(e) => set('exchange', e.target.value)}>
            <option value="">{t.common.all}</option>
            {EXCHANGES.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.name ?? t.exchange.other}
              </option>
            ))}
          </SelectField>
          <SelectField label={t.trades.filters.side} value={filters.side} onChange={(e) => set('side', e.target.value as TradeFilters['side'])}>
            <option value="">{t.common.all}</option>
            <option value="long">{t.side.long}</option>
            <option value="short">{t.side.short}</option>
          </SelectField>
          <SelectField label={t.trades.filters.status} value={filters.status} onChange={(e) => set('status', e.target.value as TradeFilters['status'])}>
            <option value="">{t.common.all}</option>
            <option value="open">{t.trades.filters.statusOpen}</option>
            <option value="closed">{t.trades.filters.statusClosed}</option>
          </SelectField>
          <SelectField label={t.trades.filters.setup} value={filters.setupId} onChange={(e) => set('setupId', e.target.value)}>
            <option value="">{t.common.all}</option>
            {setups.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
          <SelectField label={t.trades.filters.mistake} value={filters.tagId} onChange={(e) => set('tagId', e.target.value)}>
            <option value="">{t.common.all}</option>
            {tags.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
        </Card>
      )}

      {error && <Alert tone="error">{t.errors.loadFailed}</Alert>}

      {isLoading ? (
        <TradesSkeleton cards={!desktop} />
      ) : filtered.length === 0 ? (
        <Card className="text-center">
          <p className="text-muted">{trades?.length ? t.trades.emptyFiltered : preset !== 'all' ? t.trades.emptyPeriod : t.trades.empty}</p>
          {!trades?.length && preset !== 'all' && (
            <Button variant="secondary" className="mt-4" onClick={() => setPreset('all')}>
              {t.trades.showAllTime}
            </Button>
          )}
          {!trades?.length && preset === 'all' && (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button onClick={() => navigate('/import')}>{t.trades.importFileLong}</Button>
              <Button variant="secondary" onClick={() => navigate('/trades/new')}>
                {t.trades.addLong}
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-muted">
            <span>
              <RollNumber text={fmt(t.trades.count, { n: filtered.length })} token={shownKey.current} />
              {openCount > 0 && ` · ${fmt(t.trades.openCount, { n: openCount })}`}
            </span>
            <span>
              {t.trades.totalPnl}: <RollNumber className={`num font-semibold ${pnlClass(totalPnl)}`} text={formatPnl(totalPnl)} token={shownKey.current} />
            </span>
          </div>

          {/* Таблица на десктопе, карточки на телефоне — рисуем только одно из двух */}
          {desktop ? (
            <div className="rise overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface text-left text-muted">
                  <tr>
                    {[
                      t.trades.col.date,
                      t.trades.col.symbol,
                      t.trades.col.exchange,
                      t.trades.col.side,
                      t.trades.col.size,
                      t.trades.col.prices,
                      t.trades.col.setup,
                    ].map((h) => (
                      <th key={h} className="px-4 py-3 font-normal">
                        {h}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right font-normal">{t.trades.col.pnl}</th>
                    <th className="px-4 py-3 text-right font-normal">{t.trades.col.r}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((tr) => (
                    <tr
                      key={tr.id}
                      onClick={() => navigate(`/trades/${tr.id}`)}
                      data-fresh={fresh.has(tr.id) || undefined}
                      className={`cursor-pointer border-t border-border transition-colors hover:bg-surface-2/60 ${fresh.has(tr.id) ? flashCls(tr.pnl) : ''}`}
                    >
                      <td className="num whitespace-nowrap px-4 py-3 text-xs text-muted">
                        <Grow open={fresh.has(tr.id)}>{formatDateTime(tr.entry_at)}</Grow>
                      </td>
                      <td className="num px-4 py-3 font-semibold">
                        <Grow open={fresh.has(tr.id)}>
                          <Link to={`/trades/${tr.id}`} onClick={(e) => e.stopPropagation()} className="hover:underline" title={tr.title ?? undefined}>
                            {tr.title ? <span className="line-clamp-2 max-w-80 font-sans">{tr.title}</span> : tr.symbol}
                          </Link>
                          <ShotsBadge trade={tr} />
                        </Grow>
                      </td>
                      <td className="px-4 py-3 text-muted">
                        <Grow open={fresh.has(tr.id)}>{exchangeName(tr.exchange, t.exchange.other)}</Grow>
                      </td>
                      <td className="px-4 py-3">
                        <Grow open={fresh.has(tr.id)}>
                          <SideBadge side={tr.side} />
                        </Grow>
                      </td>
                      <td className="num whitespace-nowrap px-4 py-3">
                        <Grow open={fresh.has(tr.id)}>{formatUsd(tr.size_usd)}</Grow>
                      </td>
                      <td className="num whitespace-nowrap px-4 py-3 text-muted">
                        <Grow open={fresh.has(tr.id)}>
                          {formatPrice(tr.entry_price)} → {tr.exit_price !== null ? formatPrice(tr.exit_price) : <OpenBadge />}
                        </Grow>
                      </td>
                      <td className="px-4 py-3 text-muted">
                        <Grow open={fresh.has(tr.id)}>{tr.setup_id ? setupName.get(tr.setup_id) : '—'}</Grow>
                      </td>
                      <td className={`num whitespace-nowrap px-4 py-3 text-right font-semibold ${pnlClass(tr.pnl)}`}>
                        <Grow open={fresh.has(tr.id)}>{formatPnl(tr.pnl)}</Grow>
                      </td>
                      <td className={`num whitespace-nowrap px-4 py-3 text-right ${pnlClass(tr.r_multiple)}`}>
                        <Grow open={fresh.has(tr.id)}>{formatR(tr.r_multiple)}</Grow>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {visible.map((tr) => (
                <TradeCard key={tr.id} trade={tr} fresh={fresh.has(tr.id)} setupName={tr.setup_id ? setupName.get(tr.setup_id) : undefined} />
              ))}
            </ul>
          )}

          {filtered.length > shown && (
            <Button variant="secondary" className="self-center" onClick={() => setShown((n) => n + PAGE)}>
              {fmt(t.trades.showMore, { n: Math.min(PAGE, filtered.length - shown), left: filtered.length - shown })}
            </Button>
          )}
        </>
      )}
    </div>
  )
}

/** 📷 и число скриншотов у сделки */
function ShotsBadge({ trade }: { trade: TradeWithTags }) {
  const t = useT()
  const n = trade.trade_screenshots?.length ?? 0
  if (!n) return null
  return (
    <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs font-normal text-muted" title={t.tradeForm.screenshot}>
      <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
        <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
        <circle cx="12" cy="13" r="3.5" />
      </svg>
      {n}
    </span>
  )
}

function OpenBadge() {
  const t = useT()
  return <span className="rounded bg-warning/15 px-1.5 py-0.5 text-xs text-warning">{t.trades.open}</span>
}

/** Строка таблицы раздвигает список: содержимое ячеек растёт по высоте (grid-rows 0fr → 1fr) — у <tr> так нельзя */
function Grow({ open, children }: { open: boolean; children: React.ReactNode }) {
  if (!open) return <>{children}</>
  return (
    <div className="rows-open">
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  )
}

/** Вспышка новой строки цветом результата (№12) */
const flashCls = (pnl: number | null) => (pnl !== null && pnl < 0 ? 'animate-flash-down' : 'animate-flash-up')

function TradeCard({ trade: tr, setupName, fresh = false }: { trade: TradeWithTags; setupName?: string; fresh?: boolean }) {
  const t = useT()
  return (
    // новая сделка с биржи раздвигает список (grid-rows 0fr → 1fr) и вспыхивает
    <li data-fresh={fresh || undefined} className={fresh ? 'rows-open' : undefined}>
      <div className={fresh ? 'min-h-0 overflow-hidden' : undefined}>
        <Link
          to={`/trades/${tr.id}`}
          className={`block rounded-xl border border-border bg-surface p-4 transition-colors active:bg-surface-2 ${fresh ? flashCls(tr.pnl) : ''}`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className={tr.title ? 'line-clamp-2 font-semibold' : 'num font-semibold'}>{tr.title ?? tr.symbol}</span>
              <SideBadge side={tr.side} />
              <ShotsBadge trade={tr} />
              {tr.exit_at === null && <OpenBadge />}
            </div>
            <span className={`num font-semibold ${pnlClass(tr.pnl)}`}>{formatPnl(tr.pnl)}</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-muted">
            <span>
              {formatDateTime(tr.entry_at)} · {exchangeName(tr.exchange, t.exchange.other)}
              {setupName && ` · ${setupName}`}
            </span>
            <span className={`num ${pnlClass(tr.r_multiple)}`}>{formatR(tr.r_multiple)}</span>
          </div>
        </Link>
      </div>
    </li>
  )
}
