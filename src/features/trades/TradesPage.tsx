import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { fmt, useT } from '@/i18n'
import { SideBadge } from '@/components/SideBadge'
import { RollNumber } from '@/components/RollNumber'
import { TradesSkeleton } from '@/components/Skeleton'
import { useArrivals } from '@/lib/arrivals'
import { UpgradeLine } from '@/components/UpgradeLine'
import { useBulkDelete, useBulkSetSetup, useTrades } from './api'
import { applyFilters, durationMs, EMPTY_FILTERS, fromParams, hasActiveFilters, hiddenFiltersCount, sortTrades, toParams, type Sort, type SortKey, type TradeFilters } from './filters'
import { useList, useUsage } from '@/features/settings/api'
import { PeriodFilter } from '@/components/PeriodFilter'
import { useTimeZone } from '@/lib/useTimeZone'
import { rangeFor, type CustomRange, type PeriodPreset } from '@/lib/period'
import { SelectField } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import { EXCHANGES, exchangeName } from '@/lib/exchanges'
import { formatDateTime, formatDuration, formatPnl, formatPrice, formatR, formatUsd, pnlClass } from '@/lib/format'
import { dbErrorMessage } from '@/lib/errors'
import type { TradeWithTags } from '@/types/db'
import { useMediaQuery } from '@/lib/useMediaQuery'

/** Сколько сделок рисуем за раз: тысячи строк сразу тормозят браузер */
const PAGE = 100

export function TradesPage() {
  const t = useT()
  const f = t.trades.filters
  const navigate = useNavigate()
  // по умолчанию — всё время: иначе импортированная история за прошлые месяцы «пропадает».
  // ?day=YYYY-MM-DD (клик по дню в календаре) — сразу «свой диапазон» на этот день
  const [params, setParams] = useSearchParams()
  const day = /^\d{4}-\d{2}-\d{2}$/.test(params.get('day') ?? '') ? params.get('day')! : null
  const [preset, setPreset] = useState<PeriodPreset>(day ? 'custom' : 'all')
  const [custom, setCustom] = useState<CustomRange>(day ? { from: day, to: day } : { from: '', to: '' })
  // фильтры и сортировка живут в адресе (?side=long&result=win&sort=pnl…): ссылка открывает тот же вид
  const { filters, sort } = useMemo(() => fromParams(params), [params])
  const update = (next: TradeFilters, nextSort: Sort = sort) => setParams(toParams(params, next, nextSort), { replace: true })
  const set = <K extends keyof TradeFilters>(k: K, v: TradeFilters[K]) => update({ ...filters, [k]: v })
  const toggle = <K extends 'side' | 'result'>(k: K, v: TradeFilters[K]) => set(k, filters[k] === v ? ('' as TradeFilters[K]) : v)
  const sortBy = (key: SortKey) =>
    update(filters, sort.key === key ? { key, dir: sort.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: key === 'symbol' ? 'asc' : 'desc' })
  const [showFilters, setShowFilters] = useState(() => hiddenFiltersCount(filters) > 0)

  const tz = useTimeZone()
  const range = useMemo(() => rangeFor(preset, custom, new Date(), tz), [preset, custom, tz])
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
  const { data: emotions = [] } = useList('emotions')
  const { data: usage } = useUsage()

  const filtered = useMemo(() => applyFilters(trades ?? [], filters), [trades, filters])
  // сортировка — по уже загруженным сделкам; порции по 100 («Показать ещё») — после сортировки
  const sorted = useMemo(() => sortTrades(filtered, sort), [filtered, sort])
  const [shown, setShown] = useState(PAGE)
  useEffect(() => setShown(PAGE), [preset, custom, filters, sort])
  const visible = sorted.slice(0, shown)
  const desktop = useMediaQuery('(min-width: 768px)')
  const setupName = useMemo(() => new Map(setups.map((s) => [s.id, s.name])), [setups])
  // колонку «Биржа» показываем, только если бирж в загруженных сделках больше одной
  const multiExchange = useMemo(() => new Set((trades ?? []).map((tr) => tr.exchange)).size > 1, [trades])
  const closed = filtered.filter((tr) => tr.pnl !== null)
  const openCount = filtered.length - closed.length
  const totalPnl = closed.reduce((sum, tr) => sum + Number(tr.pnl), 0)

  // галочки у строк → панель действий снизу
  const [selected, setSelected] = useState<Set<string>>(new Set())
  useEffect(() => setSelected(new Set()), [preset, custom])
  const selectedTrades = useMemo(() => (trades ?? []).filter((tr) => selected.has(tr.id)), [trades, selected])
  const allVisibleSelected = visible.length > 0 && visible.every((tr) => selected.has(tr.id))
  const toggleOne = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const toggleAll = () => setSelected(allVisibleSelected ? new Set() : new Set(visible.map((tr) => tr.id)))
  const [done, setDone] = useState<string | null>(null)

  const sortTh = (key: SortKey, label: string, right = false) => {
    const active = sort.key === key
    return (
      <th key={key} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={`px-4 py-3 font-normal ${right ? 'text-right' : ''}`}>
        <button
          type="button"
          onClick={() => sortBy(key)}
          aria-label={fmt(t.trades.sort.by, { col: label })}
          className={`group -my-1 inline-flex items-center gap-1 whitespace-nowrap py-1 transition-colors hover:text-text ${active ? 'font-medium text-text' : ''}`}
        >
          {label}
          <span aria-hidden className={`text-[10px] ${active ? '' : 'opacity-0 group-hover:opacity-40'}`}>
            {active && sort.dir === 'asc' ? '▲' : '▼'}
          </span>
        </button>
      </th>
    )
  }

  return (
    <div className={`flex flex-col gap-4 ${selected.size ? 'pb-24' : ''}`}>
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

      <PeriodFilter preset={preset} custom={custom} onPreset={setPreset} onCustom={setCustom} />

      {/* быстрые фильтры — всегда на виду (образец — 21st.dev data-table-with-filters: строка фильтров над таблицей) */}
      <div role="toolbar" aria-label={f.quick} data-shot="quick-filters" className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={filters.symbol}
          onChange={(e) => set('symbol', e.target.value)}
          placeholder={f.search}
          aria-label={f.search}
          className="h-9 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm text-text field-focus placeholder:text-muted/70 sm:w-44"
        />
        <Pills
          options={[
            { value: 'long', label: t.side.long },
            { value: 'short', label: t.side.short },
          ]}
          value={filters.side}
          onToggle={(v) => toggle('side', v as TradeFilters['side'])}
        />
        <Pills
          options={[
            { value: 'win', label: f.win },
            { value: 'loss', label: f.loss },
          ]}
          value={filters.result}
          onToggle={(v) => toggle('result', v as TradeFilters['result'])}
        />
        <select
          aria-label={f.setup}
          value={filters.setupId}
          onChange={(e) => set('setupId', e.target.value)}
          className={`h-9 rounded-lg border bg-surface-2 px-2 text-sm field-focus ${filters.setupId ? 'border-primary text-text' : 'border-border text-muted'}`}
        >
          <option value="">{f.anySetup}</option>
          {setups.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <Button variant="secondary" className="!h-9 !py-0" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
          {f.show}
          {hiddenFiltersCount(filters) > 0 && (
            <span data-count className="num rounded-full bg-primary px-1.5 text-xs leading-5 text-on-primary">
              {hiddenFiltersCount(filters)}
            </span>
          )}
        </Button>
        {hasActiveFilters(filters) && (
          <Button variant="ghost" className="!h-9 !py-0" onClick={() => update(EMPTY_FILTERS)}>
            {f.reset}
          </Button>
        )}
        {!desktop && (
          <select
            aria-label={t.trades.sort.label}
            value={`${sort.key}:${sort.dir}`}
            onChange={(e) => {
              const [key, dir] = e.target.value.split(':') as [SortKey, 'asc' | 'desc']
              update(filters, { key, dir })
            }}
            className="h-9 rounded-lg border border-border bg-surface-2 px-2 text-sm text-muted field-focus"
          >
            {SORT_COLS.flatMap((key) =>
              (['desc', 'asc'] as const).map((dir) => (
                <option key={`${key}:${dir}`} value={`${key}:${dir}`}>
                  {`${sortLabel(t, key)} ${dir === 'desc' ? '↓' : '↑'}`}
                </option>
              )),
            )}
          </select>
        )}
      </div>

      {showFilters && (
        <Card className="grid grid-cols-2 gap-3 !p-4 md:grid-cols-4">
          <SelectField label={f.exchange} value={filters.exchange} onChange={(e) => set('exchange', e.target.value)}>
            <option value="">{t.common.all}</option>
            {EXCHANGES.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.name ?? t.exchange.other}
              </option>
            ))}
          </SelectField>
          <SelectField label={f.status} value={filters.status} onChange={(e) => set('status', e.target.value as TradeFilters['status'])}>
            <option value="">{t.common.all}</option>
            <option value="open">{f.statusOpen}</option>
            <option value="closed">{f.statusClosed}</option>
          </SelectField>
          <SelectField label={f.mistake} value={filters.tagId} onChange={(e) => set('tagId', e.target.value)}>
            <option value="">{t.common.all}</option>
            {tags.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
          <SelectField label={f.emotion} value={filters.emotionId} onChange={(e) => set('emotionId', e.target.value)}>
            <option value="">{t.common.all}</option>
            {emotions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
        </Card>
      )}

      {error && <Alert tone="error">{t.errors.loadFailed}</Alert>}
      {done && <Alert tone="success">{done}</Alert>}

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
                    <th className="w-10 p-0 font-normal">
                      {/* вся ячейка — зона нажатия галочки (сама галочка 16px) */}
                      <label className="flex cursor-pointer items-center py-3 pr-1 pl-4">
                        <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} aria-label={t.trades.bulk.selectAll} className="size-4 accent-primary" />
                      </label>
                    </th>
                    {sortTh('date', t.trades.col.date)}
                    {sortTh('symbol', t.trades.col.symbol)}
                    {multiExchange && <th className="px-4 py-3 font-normal">{t.trades.col.exchange}</th>}
                    <th className="px-4 py-3 font-normal">{t.trades.col.side}</th>
                    {sortTh('size', t.trades.col.size)}
                    <th className="px-4 py-3 font-normal">{t.trades.col.prices}</th>
                    {sortTh('duration', t.trades.col.duration)}
                    <th className="px-4 py-3 font-normal">{t.trades.col.setup}</th>
                    {sortTh('pnl', t.trades.col.pnl, true)}
                    {sortTh('r', t.trades.col.r, true)}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((tr) => (
                    <tr
                      key={tr.id}
                      onClick={() => navigate(`/trades/${tr.id}`)}
                      data-fresh={fresh.has(tr.id) || undefined}
                      className={`cursor-pointer border-t border-border transition-colors hover:bg-surface-2/60 ${selected.has(tr.id) ? 'bg-primary/5' : ''} ${fresh.has(tr.id) ? flashCls(tr.pnl) : ''}`}
                    >
                      <td className="p-0" onClick={(e) => e.stopPropagation()}>
                        <label className="flex cursor-pointer items-center py-3 pr-1 pl-4">
                          <input
                            type="checkbox"
                            checked={selected.has(tr.id)}
                            onChange={() => toggleOne(tr.id)}
                            aria-label={fmt(t.trades.bulk.select, { name: tr.title ?? tr.symbol })}
                            className="size-4 accent-primary"
                          />
                        </label>
                      </td>
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
                      {multiExchange && (
                        <td className="px-4 py-3 text-muted">
                          <Grow open={fresh.has(tr.id)}>{exchangeName(tr.exchange, t.exchange.other)}</Grow>
                        </td>
                      )}
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
                      <td data-duration className="num whitespace-nowrap px-4 py-3 text-muted">
                        <Grow open={fresh.has(tr.id)}>{formatDuration(durationMs(tr))}</Grow>
                      </td>
                      <td className="px-4 py-3 text-muted">
                        <Grow open={fresh.has(tr.id)}>{tr.setup_id ? setupName.get(tr.setup_id) : '—'}</Grow>
                      </td>
                      <td data-pnl className={`num whitespace-nowrap px-4 py-3 text-right font-semibold ${pnlClass(tr.pnl)}`}>
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
                <TradeCard
                  key={tr.id}
                  trade={tr}
                  fresh={fresh.has(tr.id)}
                  setupName={tr.setup_id ? setupName.get(tr.setup_id) : undefined}
                  showExchange={multiExchange}
                  selected={selected.has(tr.id)}
                  onSelect={() => toggleOne(tr.id)}
                />
              ))}
            </ul>
          )}

          {sorted.length > shown && (
            <Button variant="secondary" className="self-center" onClick={() => setShown((n) => n + PAGE)}>
              {fmt(t.trades.showMore, { n: Math.min(PAGE, sorted.length - shown), left: sorted.length - shown })}
            </Button>
          )}
        </>
      )}

      {selected.size > 0 && (
        <BulkBar
          trades={selectedTrades}
          setups={setups}
          onClear={() => setSelected(new Set())}
          onDone={(msg) => {
            setSelected(new Set())
            setDone(msg)
          }}
        />
      )}
    </div>
  )
}

const SORT_COLS: SortKey[] = ['date', 'symbol', 'size', 'pnl', 'r', 'duration']
const sortLabel = (t: ReturnType<typeof useT>, key: SortKey) =>
  ({ date: t.trades.col.date, symbol: t.trades.col.symbol, size: t.trades.col.size, pnl: t.trades.col.pnl, r: t.trades.col.r, duration: t.trades.col.duration })[key]

/** Пилюли быстрого фильтра: нажатие включает, повторное — выключает */
function Pills({ options, value, onToggle }: { options: { value: string; label: string }[]; value: string; onToggle: (v: string) => void }) {
  return (
    <div className="inline-flex h-9 items-center rounded-lg border border-border bg-surface-2/60 p-0.5">
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(o.value)}
            className={`h-full rounded-md px-3 text-sm transition-colors ${on ? 'bg-primary text-on-primary' : 'text-muted hover:text-text'}`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Панель действий с выбранными сделками: назначить сетап, удалить (с подтверждением в окне) */
function BulkBar({
  trades,
  setups,
  onClear,
  onDone,
}: {
  trades: TradeWithTags[]
  setups: { id: string; name: string }[]
  onClear: () => void
  onDone: (msg: string) => void
}) {
  const t = useT()
  const b = t.trades.bulk
  const [setupId, setSetupId] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const setSetup = useBulkSetSetup()
  const del = useBulkDelete()
  const dialog = useRef<HTMLDialogElement>(null)
  const n = trades.length

  async function applySetup() {
    setErr(null)
    try {
      await setSetup.mutateAsync({ ids: trades.map((tr) => tr.id), setupId: setupId === NO_SETUP ? null : setupId })
      onDone(fmt(b.doneSetup, { n }))
    } catch (e) {
      setErr(dbErrorMessage(e, t))
    }
  }
  async function remove() {
    setErr(null)
    try {
      await del.mutateAsync(trades)
      dialog.current?.close()
      onDone(fmt(b.doneDelete, { n }))
    } catch (e) {
      setErr(dbErrorMessage(e, t))
    }
  }

  return (
    <>
      <div
        role="region"
        aria-label={fmt(b.selected, { n })}
        data-shot="bulk-bar"
        className="fixed inset-x-3 bottom-20 z-30 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3 shadow-2xl md:inset-x-auto md:bottom-4 md:left-1/2 md:-translate-x-1/2 md:flex-nowrap lg:ml-[140px]"
      >
        {/* телефон: «Выбрано» и «Снять» — сверху, выбор сетапа — во всю ширину, кнопки — под ним; компьютер — всё в одну строку */}
        <span className="num order-1 flex-1 px-1 text-sm font-semibold whitespace-nowrap md:flex-none">{fmt(b.selected, { n })}</span>
        <Button variant="ghost" className="order-2 !h-9 !py-0 whitespace-nowrap md:order-5" onClick={onClear}>
          {b.clear}
        </Button>
        <select
          aria-label={b.setSetup}
          value={setupId}
          onChange={(e) => setSetupId(e.target.value)}
          className="order-3 h-9 w-full rounded-lg border border-border bg-surface-2 px-2 text-sm field-focus md:w-48"
        >
          <option value="">{b.setSetup}…</option>
          <option value={NO_SETUP}>{b.noSetup}</option>
          {setups.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <Button className="order-4 !h-9 flex-1 !py-0 md:flex-none" disabled={!setupId} loading={setSetup.isPending} onClick={() => void applySetup()}>
          {b.apply}
        </Button>
        <Button variant="dangerOutline" className="order-4 !h-9 flex-1 !py-0 md:flex-none" onClick={() => dialog.current?.showModal()}>
          {b.delete}
        </Button>
        {err && <p className="order-last w-full text-sm text-loss">{err}</p>}
      </div>
      <dialog
        ref={dialog}
        aria-labelledby="bulk-delete-title"
        onClick={(e) => e.target === dialog.current && dialog.current?.close()}
        className="m-auto w-[min(420px,calc(100%-32px))] rounded-2xl border border-border bg-surface p-5 text-text shadow-2xl backdrop:bg-bg/70"
      >
        <h2 id="bulk-delete-title" className="font-semibold">
          {b.confirmTitle}
        </h2>
        <p className="mt-2 text-sm text-muted">{fmt(b.confirmText, { n })}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => dialog.current?.close()}>
            {b.cancel}
          </Button>
          <Button variant="danger" loading={del.isPending} onClick={() => void remove()}>
            {fmt(b.deleteConfirm, { n })}
          </Button>
        </div>
      </dialog>
    </>
  )
}

/** значение «без сетапа» в выборе панели действий */
const NO_SETUP = '__none__'

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

function TradeCard({
  trade: tr,
  setupName,
  fresh = false,
  showExchange,
  selected,
  onSelect,
}: {
  trade: TradeWithTags
  setupName?: string
  fresh?: boolean
  showExchange: boolean
  selected: boolean
  onSelect: () => void
}) {
  const t = useT()
  const caption = [formatDateTime(tr.entry_at), showExchange ? exchangeName(tr.exchange, t.exchange.other) : null, setupName, tr.exit_at ? formatDuration(durationMs(tr)) : null]
    .filter(Boolean)
    .join(' · ')
  return (
    // новая сделка с биржи раздвигает список (grid-rows 0fr → 1fr) и вспыхивает
    <li data-fresh={fresh || undefined} className={fresh ? 'rows-open' : undefined}>
      <div className={`flex items-stretch gap-2 ${fresh ? 'min-h-0 overflow-hidden' : ''}`}>
        {/* галочка слева в карточке — выбрать для массовых действий (долгое нажатие не нужно) */}
        <label className="flex shrink-0 items-center pl-1">
          <input
            type="checkbox"
            checked={selected}
            onChange={onSelect}
            aria-label={fmt(t.trades.bulk.select, { name: tr.title ?? tr.symbol })}
            className="size-5 accent-primary"
          />
        </label>
        <Link
          to={`/trades/${tr.id}`}
          className={`block min-w-0 flex-1 rounded-xl border bg-surface p-4 transition-colors active:bg-surface-2 ${selected ? 'border-primary' : 'border-border'} ${fresh ? flashCls(tr.pnl) : ''}`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className={tr.title ? 'line-clamp-2 font-semibold' : 'num font-semibold'}>{tr.title ?? tr.symbol}</span>
              <SideBadge side={tr.side} />
              <ShotsBadge trade={tr} />
              {tr.exit_at === null && <OpenBadge />}
            </div>
            <span className={`num shrink-0 font-semibold ${pnlClass(tr.pnl)}`}>{formatPnl(tr.pnl)}</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-muted">
            <span>{caption}</span>
            <span className={`num ${pnlClass(tr.r_multiple)}`}>{formatR(tr.r_multiple)}</span>
          </div>
        </Link>
      </div>
    </li>
  )
}
