/**
 * «Разбор» — таблицы, где видно, на чём зарабатываешь и теряешь: сетапы, топ ошибок, пары, эмоции.
 * Long / Short — компактная сводка наверху рядом с периодом; над таблицами — одна строка-вывод (лучший сетап, самая дорогая ошибка).
 * Тот же период и те же расчёты, что на дашборде.
 */
import { useMemo, useRef, useState } from 'react'
import { AnalysisSkeleton } from '@/components/Skeleton'
import { useNavigate, useSearchParams } from 'react-router'
import { fmt, plural, useT } from '@/i18n'
import { useTrades } from '@/features/trades/api'
import { useList } from '@/features/settings/api'
import { PeriodFilter } from '@/components/PeriodFilter'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { SideBadge } from '@/components/SideBadge'
import { formatPercent, formatPnl, pnlClass } from '@/lib/format'
import { useTimeZone } from '@/lib/useTimeZone'
import { rangeFor, type CustomRange, type PeriodPreset } from '@/lib/period'
import { byEmotion, bySetup, bySide, bySymbol, closedTrades, groupTotal, topMistakes, type ClosedTrade, type Group, type StatTrade } from '@/lib/calc/stats'
import { GroupTable, type Row } from '@/features/dashboard/GroupTable'
import { GroupTrades } from './GroupTrades'
import { CoinChip } from '@/features/portfolio/CoinChip'

/** Вкладки «Разбора» — капсулой по центру (как верхнее меню). «Время суток» и «Плечо» владелец убрал 15.11.2026 */
const TABS = ['setups', 'mistakes', 'pairs', 'emotions'] as const
type Tab = (typeof TABS)[number]

/** В какие строки таблицы вкладки попадает сделка (те же ключи, что у таблиц: «—» — без сетапа / эмоции) */
function rowKeys(tab: Tab, tr: ClosedTrade): string[] {
  switch (tab) {
    case 'setups':
      return [tr.setup_id ?? '—']
    case 'emotions':
      return [tr.emotion_id ?? '—']
    case 'mistakes':
      return tr.tagIds
    case 'pairs':
      return [tr.symbol]
  }
}

/** С какого числа сделок за период показывать строку-вывод */
const MIN_INSIGHT = 10

/** Long / Short — две строки: сделок, винрейт, PnL */
function SideSummary({ groups }: { groups: Group<'long' | 'short'>[] }) {
  const t = useT()
  return (
    <section data-shot="side-summary" aria-labelledby="side-summary" className="rounded-lg border border-border bg-surface px-3 py-2">
      <h2 id="side-summary" className="sr-only">
        {t.dashboard.tables.side}
      </h2>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm">
        {groups.map((g) => (
          <div key={g.key} className="contents">
            <dt>
              <SideBadge side={g.key} />
            </dt>
            <dd className="text-xs whitespace-nowrap text-muted">
              {fmt(t.analysis.sideLine, { trades: fmt(t.dashboard.tooltipTrades, { n: g.count }), winrate: formatPercent(g.winrate, 0) })}
            </dd>
            <dd className={`num text-right font-semibold whitespace-nowrap ${pnlClass(g.pnl)}`}>{g.count ? formatPnl(g.pnl) : '—'}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export function AnalysisPage() {
  const t = useT()
  const navigate = useNavigate()
  const [preset, setPreset] = useState<PeriodPreset>('all')
  const [custom, setCustom] = useState<CustomRange>({ from: '', to: '' })
  const tz = useTimeZone()
  const range = useMemo(() => rangeFor(preset, custom, new Date(), tz), [preset, custom, tz])

  const { data: trades, isLoading, error, isPlaceholderData } = useTrades(range)
  // период, чьи сделки уже на экране: при его смене суммы в таблицах прокручиваются (№13)
  const periodKey = `${preset}|${custom.from}|${custom.to}`
  const shownKey = useRef(periodKey)
  if (!isLoading && !isPlaceholderData) shownKey.current = periodKey
  const rk = shownKey.current
  const { data: setups = [] } = useList('setups')
  const { data: emotions = [] } = useList('emotions')
  const { data: tags = [] } = useList('mistake_tags')

  // вкладка — в адресе (?tab=pairs): ссылка открывает тот же разрез
  const [params, setParams] = useSearchParams()
  const tab: Tab = TABS.includes(params.get('tab') as Tab) ? (params.get('tab') as Tab) : 'setups'
  // выбранная строка таблицы — её сделки карточками справа; при смене вкладки — сброс
  const [selected, setSelected] = useState<string | null>(null)
  const setTab = (next: Tab) => {
    setSelected(null)
    const p = new URLSearchParams(params)
    if (next === 'setups') p.delete('tab')
    else p.set('tab', next)
    setParams(p, { replace: true })
  }

  const stats = useMemo(() => {
    const all: StatTrade[] = (trades ?? []).map((tr) => ({ ...tr, tagIds: tr.trade_mistakes.map((m) => m.tag_id) }))
    const closed = closedTrades(all)
    return {
      closed,
      side: bySide(closed),
      setups: bySetup(closed),
      emotions: byEmotion(closed),
      mistakes: topMistakes(closed),
      symbols: bySymbol(closed),
      total: groupTotal(closed),
      mistakesTotal: groupTotal(closed, true),
      // у рынков Polymarket вместо кода — название рынка
      titles: new Map((trades ?? []).flatMap((tr) => (tr.title ? [[tr.symbol, tr.title] as const] : []))),
    }
  }, [trades])

  const c = t.dashboard.tables
  const names = (list: { id: string; name: string }[]) => new Map(list.map((x) => [x.id, x.name]))
  const toRows = (groups: Group<string | null>[], nameMap: Map<string, string>, noneLabel: string): Row[] =>
    groups.map((g) => ({ id: g.key ?? '—', label: g.key === null ? noneLabel : (nameMap.get(g.key) ?? c.deleted), group: g }))

  // строка-вывод: сетап с наибольшим PnL (в плюсе) и ошибка с наибольшим убытком; сделок мало — не показываем
  const best = stats.setups.find((g) => g.key !== null && g.pnl > 0)
  const worst = stats.mistakes.find((g) => g.lossSum < 0)
  const insight =
    stats.closed.length >= MIN_INSIGHT
      ? [
          best && fmt(t.analysis.insightBest, { name: names(setups).get(best.key!) ?? c.deleted, pnl: formatPnl(best.pnl) }),
          worst && fmt(t.analysis.insightWorst, { name: names(tags).get(worst.key) ?? c.deleted, pnl: formatPnl(worst.lossSum) }),
        ].filter(Boolean)
      : []

  const tableProps = ((): { title: string; hint?: string; rows: Row[]; total: Group<unknown>; mode?: 'mistakes'; empty?: string } => {
    switch (tab) {
      case 'setups':
        return { title: t.analysis.tabs.setups, rows: toRows(stats.setups, names(setups), c.noSetup), total: stats.total }
      case 'mistakes':
        return {
          title: t.analysis.tabs.mistakes,
          hint: c.mistakesHint,
          mode: 'mistakes',
          empty: c.mistakesEmpty,
          rows: stats.mistakes.map((g) => ({ id: g.key, label: names(tags).get(g.key) ?? c.deleted, group: g })),
          total: stats.mistakesTotal,
        }
      case 'pairs':
        return { title: t.analysis.tabs.pairs, rows: stats.symbols.map((g) => ({ id: g.key, label: stats.titles.get(g.key) ?? g.key, node: <CoinChip symbol={g.key} title={stats.titles.get(g.key)} />, group: g })), total: stats.total }
      case 'emotions':
        return { title: t.analysis.tabs.emotions, rows: toRows(stats.emotions, names(emotions), c.noEmotion), total: stats.total }
    }
  })()
  const selectedRow = tableProps.rows.find((r) => r.id === selected) ?? null
  // сделки для карточек справа: выбранной строки или все сделки периода
  const groupTrades = useMemo(() => {
    const ids = new Set(stats.closed.filter((tr) => !selectedRow || rowKeys(tab, tr).includes(selectedRow.id)).map((tr) => tr.id))
    return (trades ?? []).filter((tr) => ids.has(tr.id))
  }, [stats.closed, trades, selectedRow, tab])
  const tabCount: Record<Tab, number> = {
    setups: stats.setups.filter((g) => g.key !== null).length,
    mistakes: stats.mistakes.length,
    pairs: stats.symbols.length,
    emotions: stats.emotions.filter((g) => g.key !== null).length,
  }
  // одна строка «Без сетапа» / «Не указана» — таблица ничего не сравнивает: вместо неё объяснение, что делать
  const unmarked = (tab === 'setups' || tab === 'emotions') && tableProps.rows.length === 1 && tableProps.rows[0].id === '—'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t.analysis.title}</h1>
          <p className="mt-1 text-sm text-muted">{t.analysis.hint}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {stats.closed.length > 0 && <SideSummary groups={stats.side} />}
          <PeriodFilter preset={preset} custom={custom} onPreset={setPreset} onCustom={setCustom} />
        </div>
      </div>

      {error && <Alert tone="error">{t.errors.loadFailed}</Alert>}

      {isLoading ? (
        <AnalysisSkeleton />
      ) : stats.closed.length === 0 ? (
        <Card className="text-center">
          <p className="text-muted">{t.dashboard.empty}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button onClick={() => navigate('/import')}>{t.trades.importFileLong}</Button>
            <Button variant="secondary" onClick={() => navigate('/trades/new')}>
              {t.trades.addLong}
            </Button>
          </div>
        </Card>
      ) : (
        <>
        {insight.length > 0 && (
          <p data-shot="insight" className="rounded-lg border border-border bg-surface px-4 py-3 text-sm">
            {insight.join(' ')}
          </p>
        )}
        {/* вкладки — капсулой по центру, как верхнее меню (образец — 21st.dev tubelight-navbar): над активной — «лампа», у каждой — сколько групп */}
        <div className="flex justify-center">
          <div
            role="tablist"
            aria-label={t.analysis.tabsLabel}
            data-shot="analysis-tabs"
            className="flex max-w-full items-center gap-0.5 overflow-x-auto overflow-y-hidden rounded-full border border-border bg-surface p-1 shadow-sm"
          >
            {TABS.map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`relative flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors sm:px-4 ${
                  tab === k ? 'bg-surface-2 text-text' : 'text-muted hover:text-text'
                }`}
              >
                {tab === k && <span className="absolute -top-1 left-1/2 h-1 w-6 -translate-x-1/2 rounded-full bg-primary" aria-hidden />}
                {t.analysis.tabs[k]}
                {/* число групп — от 640px: на телефоне иначе четыре вкладки не помещаются */}
                <span className={`num hidden rounded-full px-1.5 text-xs sm:inline ${tab === k ? 'bg-primary/15 text-primary' : 'bg-surface-2 text-muted'}`}>{tabCount[k]}</span>
              </button>
            ))}
          </div>
        </div>
        <div role="tabpanel" aria-label={t.analysis.tabs[tab]}>
          {/* сверху — лента сделок со скриншотами на всю ширину (листается вбок, клик → сделка), под ней — компактная таблица */}
            <div className="flex flex-col gap-4">
              <GroupTrades key={`${tab}|${selected ?? ''}`} name={selectedRow?.label ?? null} trades={groupTrades} canPick={!unmarked} onReset={() => setSelected(null)} />
              {unmarked ? (
                // всё «Без сетапа» / «Не указана»: вместо таблицы из одной строки — что сделать
                <Card data-shot="analysis-empty" className="flex flex-col gap-3 border-dashed !py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="font-semibold">{t.analysis.empty[tab as 'setups' | 'emotions'].title}</h2>
                    <p className="mt-1 max-w-2xl text-sm text-muted">
                      {fmt(t.analysis.empty[tab as 'setups' | 'emotions'].text, { trades: plural(stats.closed.length, t.dashboard.calendar.tradesN) })}
                    </p>
                  </div>
                  {tab === 'setups' && (
                    <Button className="shrink-0" onClick={() => navigate('/trades')}>
                      {t.analysis.empty.setups.cta}
                    </Button>
                  )}
                </Card>
              ) : (
                <GroupTable key={tab} compact rollKey={rk} {...tableProps} selectedId={selected} onSelect={(id) => setSelected((cur) => (cur === id ? null : id))} />
              )}
            </div>
        </div>
        </>
      )}
    </div>
  )
}
