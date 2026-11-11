/**
 * «Разбор» — таблицы, где видно, на чём зарабатываешь и теряешь:
 * Long / Short, сетапы, топ ошибок, эмоции, пары. Тот же период и те же расчёты, что на дашборде.
 */
import { useMemo, useRef, useState } from 'react'
import { AnalysisSkeleton } from '@/components/Skeleton'
import { useNavigate } from 'react-router'
import { useT } from '@/i18n'
import { useTrades } from '@/features/trades/api'
import { useList } from '@/features/settings/api'
import { PeriodFilter } from '@/components/PeriodFilter'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { rangeFor, type CustomRange, type PeriodPreset } from '@/lib/period'
import { byEmotion, bySetup, bySide, bySymbol, closedTrades, topMistakes, type Group, type StatTrade } from '@/lib/calc/stats'
import { GroupTable, type Row } from '@/features/dashboard/GroupTable'

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t.analysis.title}</h1>
          <p className="mt-1 text-sm text-muted">{t.analysis.hint}</p>
        </div>
        <PeriodFilter preset={preset} custom={custom} onPreset={setPreset} onCustom={setCustom} />
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
        <div className="grid gap-3 md:grid-cols-2 min-[1700px]:grid-cols-3">
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
          <GroupTable i={4} rollKey={rk} title={c.side} rows={stats.side.map((g) => ({ id: g.key, label: t.side[g.key], group: g }))} />
        </div>
      )}
    </div>
  )
}
