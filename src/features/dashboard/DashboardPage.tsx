import { lazy, Suspense, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { fmt, useT } from '@/i18n'
import { useTrades } from '@/features/trades/api'
import { useProfile } from '@/features/settings/api'
import { PeriodFilter } from '@/components/PeriodFilter'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { rangeFor, type CustomRange, type PeriodPreset } from '@/lib/period'
import { browserTimeZone } from '@/lib/tz'
import { formatUsd } from '@/lib/format'
import {
  closedTrades,
  downsampleEquity,
  drawdownPeriod,
  equityCurve,
  pnlBars,
  pnlByDay,
  rWinLoss,
  summarize,
  type StatTrade,
} from '@/lib/calc/stats'
import { KeyNumbers, KpiRow, ScoreCard } from './Widgets'
import { traderScore } from '@/lib/calc/score'
import { EquityTableDialog } from './EquityTableDialog'
import type { EquityUnit } from './equityTime'
import { Segmented } from '@/components/ui/Segmented'
import { useMediaQuery } from '@/lib/useMediaQuery'

// Recharts тяжёлый — грузим графики отдельным файлом
const EquityChart = lazy(() => import('./charts').then((m) => ({ default: m.EquityChart })))
const DailyPnlChart = lazy(() => import('./charts').then((m) => ({ default: m.DailyPnlChart })))

export function DashboardPage() {
  const t = useT()
  const navigate = useNavigate()
  const [preset, setPreset] = useState<PeriodPreset>('all')
  const [custom, setCustom] = useState<CustomRange>({ from: '', to: '' })
  const range = useMemo(() => rangeFor(preset, custom), [preset, custom])

  const { data: trades, isLoading, error } = useTrades(range)
  const { data: profile } = useProfile()

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
      days: pnlByDay(closed, tz),
    }
  }, [trades, profile?.starting_balance, tz])

  const balance = profile?.starting_balance && profile.starting_balance > 0 ? profile.starting_balance : null
  const ch = t.dashboard.charts
  const [eqUnitRaw, setEqUnit] = useState<EquityUnit>('usd')
  const eqUnit: EquityUnit = balance ? eqUnitRaw : 'usd' // % без депозита не посчитать
  const [tableOpen, setTableOpen] = useState(false)
  // на широком экране графики стоят рядом с «Оценкой» и «Ключевыми цифрами» — делаем их выше, без пустоты снизу
  const wide = useMediaQuery('(min-width: 1024px)')

  const s = stats.summary
  const score = useMemo(() => traderScore(stats.summary, stats.days), [stats])
  const bars = useMemo(() => pnlBars(stats.days), [stats.days])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        {/* заголовка на экране нет (по желанию владельца) — только для читалок экрана */}
        <h1 className="sr-only">{t.dashboard.title}</h1>
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
          {/* верхний ряд: PnL, винрейт сделок, profit factor, винрейт дней, выигрыш / проигрыш */}
          <KpiRow summary={s} score={score} startingBalance={balance} />

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)]">
            <ScoreCard score={score} trades={s.closed} />
            <Card className="rise !p-4 [--i:2]">
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
                  <EquityChart points={stats.equity} unit={eqUnit} balance={balance} height={wide ? 420 : 260} />
                </Suspense>
              </div>
            </Card>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)]">
            <KeyNumbers summary={s} curve={stats.curve} period={stats.period} rwl={stats.rwl} />
            <ChartCard i={4} title={bars.unit === 'month' ? t.dashboard.charts.monthly : bars.unit === 'week' ? t.dashboard.charts.weekly : t.dashboard.charts.daily}>
              <DailyPnlChart days={bars.bars} unit={bars.unit} height={wide ? 300 : 220} />
            </ChartCard>
          </div>

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
