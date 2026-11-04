import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react'
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
import { formatPercent, formatPnl, formatR, formatRatio, formatUsd, pnlClass } from '@/lib/format'
import {
  byEmotion,
  byHour,
  bySetup,
  bySide,
  bySymbol,
  byWeekday,
  closedTrades,
  downsampleEquity,
  equityCurve,
  pnlBars,
  pnlByDay,
  summarize,
  topMistakes,
  type Group,
  type StatTrade,
} from '@/lib/calc/stats'
import { GroupTable, type Row } from './GroupTable'

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
    return {
      openCount: all.filter((tr) => tr.exit_at === null).length,
      closed,
      summary: summarize(closed, profile?.starting_balance),
      // для графиков — не больше нескольких сотен точек: иначе браузер тормозит на тысячах сделок
      equity: downsampleEquity(equityCurve(closed)),
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

  const c = t.dashboard.tables
  const names = (list: { id: string; name: string }[]) => new Map(list.map((x) => [x.id, x.name]))
  const toRows = (groups: Group<string | null>[], nameMap: Map<string, string>, noneLabel: string): Row[] =>
    groups.map((g) => ({ id: g.key ?? '—', label: g.key === null ? noneLabel : (nameMap.get(g.key) ?? c.deleted), group: g }))

  const s = stats.summary
  const k = t.dashboard.kpi

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
          {/* Ключевые цифры */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-8">
            <Kpi label={k.totalPnl} value={formatPnl(s.totalPnl)} tone={s.totalPnl} hint={fmt(k.trades, { n: s.closed })} />
            <Kpi label={k.winrate} value={formatPercent(s.winrate)} hint={fmt(k.winLoss, { w: s.wins, l: s.losses })} />
            <Kpi label={k.profitFactor} value={formatRatio(s.profitFactor)} hint={k.profitFactorHint} />
            <Kpi label={k.avgR} value={formatR(s.avgR)} tone={s.avgR} hint={s.rCount ? fmt(k.avgRHint, { n: s.rCount }) : k.avgRNone} />
            <Kpi label={k.expectancy} value={formatPnl(s.expectancy)} tone={s.expectancy} hint={k.expectancyHint} />
            <Kpi
              label={k.maxDrawdown}
              value={s.maxDrawdown > 0 ? `−${formatUsd(s.maxDrawdown)}` : formatUsd(0)}
              tone={s.maxDrawdown > 0 ? -1 : 0}
              hint={s.maxDrawdownPct !== null ? `−${formatPercent(s.maxDrawdownPct)}` : k.maxDrawdownNoBalance}
            />
            <Kpi label={k.avgWinLoss} value={<Pair a={s.avgWin} b={s.avgLoss} />} />
            <Kpi label={k.bestWorst} value={<Pair a={s.best} b={s.worst} />} />
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            <ChartCard title={t.dashboard.charts.equity} hint={t.dashboard.charts.equityHint}>
              <EquityChart points={stats.equity} />
            </ChartCard>
            <ChartCard title={stats.bars.unit === 'month' ? t.dashboard.charts.monthly : stats.bars.unit === 'week' ? t.dashboard.charts.weekly : t.dashboard.charts.daily}>
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
        </>
      )}
    </div>
  )
}

function Kpi({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: number | null }) {
  return (
    <Card className="!p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 truncate text-lg font-semibold ${tone === undefined ? '' : pnlClass(tone)}`}>{value}</div>
      {hint && <div className="mt-0.5 truncate text-xs text-muted">{hint}</div>}
    </Card>
  )
}

function Pair({ a, b }: { a: number | null; b: number | null }) {
  return (
    <span className="flex flex-col text-base leading-tight">
      <span className={pnlClass(a)}>{formatPnl(a)}</span>
      <span className={pnlClass(b)}>{formatPnl(b)}</span>
    </span>
  )
}

function ChartCard({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const t = useT()
  return (
    <Card className="!p-4">
      <h2 className="font-medium">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      <div className="mt-3 -ml-2">
        <Suspense fallback={<div className="flex h-[180px] items-center justify-center text-sm text-muted">{t.common.loading}</div>}>{children}</Suspense>
      </div>
    </Card>
  )
}
