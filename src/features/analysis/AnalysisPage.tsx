/**
 * «Разбор» — таблицы, где видно, на чём зарабатываешь и теряешь: сетапы, топ ошибок, пары, эмоции.
 * Long / Short — компактная сводка наверху рядом с периодом; над таблицами — одна строка-вывод (лучший сетап, самая дорогая ошибка).
 * Тот же период и те же расчёты, что на дашборде.
 */
import { useMemo, useRef, useState } from 'react'
import { AnalysisSkeleton } from '@/components/Skeleton'
import { useNavigate } from 'react-router'
import { fmt, useT } from '@/i18n'
import { useTrades } from '@/features/trades/api'
import { useList } from '@/features/settings/api'
import { PeriodFilter } from '@/components/PeriodFilter'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { SideBadge } from '@/components/SideBadge'
import { formatPercent, formatPnl, pnlClass } from '@/lib/format'
import { rangeFor, type CustomRange, type PeriodPreset } from '@/lib/period'
import { byEmotion, bySetup, bySide, bySymbol, closedTrades, topMistakes, type Group, type StatTrade } from '@/lib/calc/stats'
import { GroupTable, type Row } from '@/features/dashboard/GroupTable'

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
  const range = useMemo(() => rangeFor(preset, custom), [preset, custom])

  const { data: trades, isLoading, error, isPlaceholderData } = useTrades(range)
  // период, чьи сделки уже на экране: при его смене суммы в таблицах прокручиваются (№13)
  const periodKey = `${preset}|${custom.from}|${custom.to}`
  const shownKey = useRef(periodKey)
  if (!isLoading && !isPlaceholderData) shownKey.current = periodKey
  const rk = shownKey.current
  const { data: setups = [] } = useList('setups')
  const { data: emotions = [] } = useList('emotions')
  const { data: tags = [] } = useList('mistake_tags')

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
        <div className="grid gap-3 md:grid-cols-2">
          <GroupTable i={0} rollKey={rk} title={c.setups} rows={toRows(stats.setups, names(setups), c.noSetup)} />
          <GroupTable
            i={1}
            rollKey={rk}
            title={c.mistakes}
            hint={c.mistakesHint}
            mode="mistakes"
            empty={c.mistakesEmpty}
            rows={stats.mistakes.map((g) => ({ id: g.key, label: names(tags).get(g.key) ?? c.deleted, group: g }))}
          />
          <GroupTable
            i={2}
            rollKey={rk}
            title={c.symbols}
            rows={stats.symbols.map((g) => ({ id: g.key, label: stats.titles.get(g.key) ?? g.key, group: g }))}
          />
          <GroupTable i={3} rollKey={rk} title={c.emotions} rows={toRows(stats.emotions, names(emotions), c.noEmotion)} />
        </div>
        </>
      )}
    </div>
  )
}
