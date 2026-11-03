import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { fmt, useT } from '@/i18n'
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

export function TradesPage() {
  const t = useT()
  const navigate = useNavigate()
  const [preset, setPreset] = useState<PeriodPreset>('month')
  const [custom, setCustom] = useState<CustomRange>({ from: '', to: '' })
  const [filters, setFilters] = useState<TradeFilters>(EMPTY_FILTERS)
  const [showFilters, setShowFilters] = useState(false)

  const range = useMemo(() => rangeFor(preset, custom), [preset, custom])
  const { data: trades, isLoading, error } = useTrades(range)
  const { data: setups = [] } = useList('setups')
  const { data: tags = [] } = useList('mistake_tags')
  const { data: usage } = useUsage()

  const filtered = useMemo(() => applyFilters(trades ?? [], filters), [trades, filters])
  const setupName = useMemo(() => new Map(setups.map((s) => [s.id, s.name])), [setups])
  const closed = filtered.filter((tr) => tr.pnl !== null)
  const openCount = filtered.length - closed.length
  const totalPnl = closed.reduce((sum, tr) => sum + Number(tr.pnl), 0)
  const set = <K extends keyof TradeFilters>(k: K, v: TradeFilters[K]) => setFilters((f) => ({ ...f, [k]: v }))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t.trades.title}</h1>
        <Button onClick={() => navigate('/trades/new')}>+ {t.trades.add}</Button>
      </div>

      {usage && usage.trade_limit !== null && (
        <p className={`text-sm ${usage.trades_created >= usage.trade_limit ? 'text-loss' : 'text-muted'}`}>
          {fmt(t.tradeForm.usage, { used: usage.trades_created, limit: usage.trade_limit })}
        </p>
      )}

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
          <TextField label={t.trades.filters.symbol} placeholder={t.trades.filters.symbolPlaceholder} value={filters.symbol} onChange={(e) => set('symbol', e.target.value)} />
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
        <p className="text-muted">{t.common.loading}</p>
      ) : filtered.length === 0 ? (
        <Card className="text-center">
          <p className="text-muted">{trades?.length ? t.trades.emptyFiltered : t.trades.empty}</p>
          {!trades?.length && (
            <Button className="mt-4" onClick={() => navigate('/trades/new')}>
              {t.trades.addLong}
            </Button>
          )}
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-muted">
            <span>
              {fmt(t.trades.count, { n: filtered.length })}
              {openCount > 0 && ` · ${fmt(t.trades.openCount, { n: openCount })}`}
            </span>
            <span>
              {t.trades.totalPnl}: <span className={`font-medium ${pnlClass(totalPnl)}`}>{formatPnl(totalPnl)}</span>
            </span>
          </div>

          {/* Таблица на десктопе */}
          <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-muted">
                <tr>
                  {[t.trades.col.date, t.trades.col.symbol, t.trades.col.exchange, t.trades.col.side, t.trades.col.size, t.trades.col.prices, t.trades.col.setup].map((h) => (
                    <th key={h} className="px-4 py-3 font-normal">
                      {h}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right font-normal">{t.trades.col.pnl}</th>
                  <th className="px-4 py-3 text-right font-normal">{t.trades.col.r}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((tr) => (
                  <tr key={tr.id} onClick={() => navigate(`/trades/${tr.id}`)} className="cursor-pointer border-t border-border hover:bg-surface">
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDateTime(tr.entry_at)}</td>
                    <td className="px-4 py-3 font-medium">
                      <Link to={`/trades/${tr.id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                        {tr.symbol}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted">{exchangeName(tr.exchange, t.exchange.other)}</td>
                    <td className="px-4 py-3">
                      <SideBadge side={tr.side} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{formatUsd(tr.size_usd)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">
                      {formatPrice(tr.entry_price)} → {tr.exit_price !== null ? formatPrice(tr.exit_price) : <OpenBadge />}
                    </td>
                    <td className="px-4 py-3 text-muted">{tr.setup_id ? setupName.get(tr.setup_id) : '—'}</td>
                    <td className={`whitespace-nowrap px-4 py-3 text-right font-medium ${pnlClass(tr.pnl)}`}>{formatPnl(tr.pnl)}</td>
                    <td className={`whitespace-nowrap px-4 py-3 text-right ${pnlClass(tr.r_multiple)}`}>{formatR(tr.r_multiple)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Карточки на телефоне */}
          <ul className="flex flex-col gap-2 md:hidden">
            {filtered.map((tr) => (
              <TradeCard key={tr.id} trade={tr} setupName={tr.setup_id ? setupName.get(tr.setup_id) : undefined} />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function SideBadge({ side }: { side: 'long' | 'short' }) {
  const t = useT()
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${side === 'long' ? 'bg-profit/15 text-profit' : 'bg-loss/15 text-loss'}`}>
      {t.side[side]}
    </span>
  )
}

function OpenBadge() {
  const t = useT()
  return <span className="rounded bg-warning/15 px-1.5 py-0.5 text-xs text-warning">{t.trades.open}</span>
}

function TradeCard({ trade: tr, setupName }: { trade: TradeWithTags; setupName?: string }) {
  const t = useT()
  return (
    <li>
      <Link to={`/trades/${tr.id}`} className="block rounded-xl border border-border bg-surface p-4 active:bg-surface-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-medium">{tr.symbol}</span>
            <SideBadge side={tr.side} />
            {tr.exit_at === null && <OpenBadge />}
          </div>
          <span className={`font-medium ${pnlClass(tr.pnl)}`}>{formatPnl(tr.pnl)}</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-muted">
          <span>
            {formatDateTime(tr.entry_at)} · {exchangeName(tr.exchange, t.exchange.other)}
            {setupName && ` · ${setupName}`}
          </span>
          <span className={pnlClass(tr.r_multiple)}>{formatR(tr.r_multiple)}</span>
        </div>
      </Link>
    </li>
  )
}
