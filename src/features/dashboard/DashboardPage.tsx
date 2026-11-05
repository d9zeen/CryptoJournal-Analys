import { lazy, Suspense, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { fmt, useT } from '@/i18n'
import { useTrades } from '@/features/trades/api'
import { useList, useProfile } from '@/features/settings/api'
import { PeriodFilter } from '@/components/PeriodFilter'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { rangeFor, type CustomRange, type PeriodPreset } from '@/lib/period'
import { browserTimeZone } from '@/lib/tz'
import { formatUsd } from '@/lib/format'
import {
  byEmotion,
  byHour,
  bySetup,
  bySide,
  bySymbol,
  byWeekday,
  closedTrades,
  downsampleEquity,
  drawdownPeriod,
  equityCurve,
  pnlBars,
  pnlByDay,
  rWinLoss,
  summarize,
  topMistakes,
  type Group,
  type StatTrade,
} from '@/lib/calc/stats'
import { GroupTable, type Row } from './GroupTable'
import { SummaryStrip } from './SummaryStrip'
import { EquityTableDialog } from './EquityTableDialog'
import type { EquityUnit } from './equityTime'
import { Segmented } from '@/components/ui/Segmented'

// Recharts тяжёлый — грузим графики отдельным файлом
const EquityChart = lazy(() => import('./charts').then((m) => ({ default: m.EquityChart })))
const DailyPnlChart = lazy(() => import('./charts').then((m) => ({ default: m.DailyPnlChart })))
const BucketChart = lazy(() => import('./charts').then((m) => ({ default: m.BucketChart })))

export function DashboardPage() {
  const t = useT()
  const navigate = useNavigate()
  const [preset, setPreset] = useState<PeriodPreset>('all')
  const [custom, setCustom] = useState<CustomRange>({ from: '', to: '' })
  const range = useMemo(() => rangeFor(preset, custom), [preset, custom])

  const { data: trades, isLoading, error } = useTrades(range)
  const { data: profile } = useProfile()
  const { data: setups = [] } = useList('setups')
  const { data: emotions = [] } = useList('emotions')
  const { data: tags = [] } = useList('mistake_tags')

  const tz = profile?.timezone || browserTimeZone()
  const stats = useMemo(() => {
    const all: StatTrade[] = (trades ?? []).map((tr) => ({ ...tr, tagIds: tr.trade_mistakes.map((m) => m.tag_id) }))
    const closed = closedTrades(all)
    const curve = equityCurve(closed)
    return {
      openCount: all.filter((tr) => tr.exit_at === null).length,
      closed,
      summary: summarize(closed, profile?.starting_balance),
      curve,
      // для графиков — не больше нескольких сотен точек: иначе браузер тормозит на тысячах сделок
      equity: downsampleEquity(curve),
      period: drawdownPeriod(curve),
      rwl: rWinLoss(closed),
      bars: pnlBars(pnlByDay(closed, tz)),
      side: bySide(closed),
      setups: bySetup(closed),
      emotions: byEmotion(closed),
      mistakes: topMistakes(closed),
      symbols: bySymbol(closed),
      weekday: byWeekday(closed, tz),
      hour: byHour(closed, tz),
    }
  }, [trades, profile?.starting_balance, tz])

  const balance = profile?.starting_balance && profile.starting_balance > 0 ? profile.starting_balance : null
  const ch = t.dashboard.charts
  const [eqUnitRaw, setEqUnit] = useState<EquityUnit>('usd')
  const eqUnit: EquityUnit = balance ? eqUnitRaw : 'usd' // % без депозита не посчитать
  const [tableOpen, setTableOpen] = useState(false)
  const c = t.dashboard.tables
  const names = (list: { id: string; name: string }[]) => new Map(list.map((x) => [x.id, x.name]))
  const toRows = (groups: Group<string | null>[], nameMap: Map<string, string>, noneLabel: string): Row[] =>
    groups.map((g) => ({ id: g.key ?? '—', label: g.key === null ? noneLabel : (nameMap.get(g.key) ?? c.deleted), group: g }))

  const s = stats.summary

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t.dashboard.title}</h1>
        <PeriodFilter preset={preset} custom={custom} onPreset={setPreset} onCustom={setCustom} />
      </div>

      {error && <Alert tone="error">{t.errors.loadFailed}</Alert>}

      {stats.openCount > 0 && <p className="text-sm text-warning">{fmt(t.dashboard.openTrades, { n: stats.openCount })}</p>}

      {isLoading ? (
        <p className="text-muted">{t.common.loading}</p>
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
          {/* «Лента»: PnL с мини-кривой, винрейт, profit factor, средний R */}
          <SummaryStrip summary={s} curve={stats.curve} period={stats.period} startingBalance={balance} rwl={stats.rwl} />

          <div className="grid gap-3 xl:grid-cols-2">
            <Card className="rise !p-4 [--i:1]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{ch.equity}</h2>
                  <p className="mt-0.5 text-xs text-muted">{eqUnit === 'pct' && balance ? fmt(ch.equityHintPct, { b: formatUsd(balance) }) : ch.equityHintUsd}</p>
                </div>
                <div className="flex items-center gap-2">
                  {balance && (
                    <Segmented<EquityUnit>
                      value={eqUnit}
                      onChange={setEqUnit}
                      options={[
                        { value: 'usd', label: ch.unitUsd },
                        { value: 'pct', label: ch.unitPct },
                      ]}
                    />
                  )}
                  <Button variant="secondary" onClick={() => setTableOpen(true)}>
                    {ch.table}
                  </Button>
                </div>
              </div>
              <div className="mt-3 -ml-2">
                <Suspense fallback={<div className="flex h-[260px] items-center justify-center text-sm text-muted">{t.common.loading}</div>}>
                  <EquityChart points={stats.equity} unit={eqUnit} balance={balance} />
                </Suspense>
              </div>
            </Card>
            <ChartCard i={2} title={stats.bars.unit === 'month' ? t.dashboard.charts.monthly : stats.bars.unit === 'week' ? t.dashboard.charts.weekly : t.dashboard.charts.daily}>
              <DailyPnlChart days={stats.bars.bars} unit={stats.bars.unit} />
            </ChartCard>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <GroupTable title={c.side} rows={stats.side.map((g) => ({ id: g.key, label: t.side[g.key], group: g }))} />
            <GroupTable title={c.setups} rows={toRows(stats.setups, names(setups), c.noSetup)} />
            <GroupTable
              title={c.mistakes}
              hint={c.mistakesHint}
              mode="mistakes"
              empty={c.mistakesEmpty}
              rows={stats.mistakes.map((g) => ({ id: g.key, label: names(tags).get(g.key) ?? c.deleted, group: g }))}
            />
            <GroupTable title={c.emotions} rows={toRows(stats.emotions, names(emotions), c.noEmotion)} />
            <GroupTable title={c.symbols} rows={stats.symbols.map((g) => ({ id: g.key, label: g.key, group: g }))} />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <ChartCard title={t.dashboard.charts.weekday}>
              <BucketChart data={stats.weekday.map((g) => ({ label: t.dashboard.weekdays[g.key], pnl: g.pnl, count: g.count }))} />
            </ChartCard>
            <ChartCard title={t.dashboard.charts.hour}>
              <BucketChart data={stats.hour.map((g) => ({ label: `${g.key}:00`, pnl: g.pnl, count: g.count }))} />
            </ChartCard>
          </div>

          <p className="text-xs text-muted">{fmt(t.dashboard.timezoneNote, { tz })}</p>
          <EquityTableDialog open={tableOpen} onClose={() => setTableOpen(false)} curve={stats.curve} unit={eqUnit} balance={balance} />
        </>
      )}
    </div>
  )
}

function ChartCard({ title, hint, i = 0, children }: { title: string; hint?: string; i?: number; children: ReactNode }) {
  const t = useT()
  return (
    <Card className="rise !p-4" style={{ '--i': i } as CSSProperties}>
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      <div className="mt-3 -ml-2">
        <Suspense fallback={<div className="flex h-[180px] items-center justify-center text-sm text-muted">{t.common.loading}</div>}>{children}</Suspense>
      </div>
    </Card>
  )
}
