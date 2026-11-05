/**
 * «Календарь прибыли» (вкладка «Календарь», /calendar): месяц сеткой, по дням — PnL, сделки и винрейт; справа — итог недели; внизу — итог месяца.
 * Свой месяц (стрелки), не зависит от фильтра периода. Дни соседних месяцев — заштрихованы, данные бледные.
 * На телефоне клетки компактные (PnL коротко), итог недели скрыт — итог месяца внизу.
 */
import { useMemo, useState } from 'react'
import { plural, useT } from '@/i18n'
import { useTrades } from '@/features/trades/api'
import { Card } from '@/components/ui/Card'
import { closedTrades } from '@/lib/calc/stats'
import { calendarSpan, compactPnl, profitCalendar, type CalCell, type CalDay } from '@/lib/calc/calendar'
import { formatPnl, formatPercent } from '@/lib/format'
import { parseYmd, ymd } from '@/lib/period'
import { useMediaQuery } from '@/lib/useMediaQuery'

const monthTitle = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' })
/** сделка могла открыться задолго до закрытия — грузим с запасом */
const LOOKBACK_DAYS = 60

const tone = (c: CalCell) => (c.count === 0 ? '' : c.pnl > 0 ? 'profit' : c.pnl < 0 ? 'loss' : 'flat')

export function ProfitCalendar({ timeZone }: { timeZone: string }) {
  const t = useT()
  const c = t.dashboard.calendar
  const wide = useMediaQuery('(min-width: 768px)')
  const now = new Date()
  const [view, setView] = useState({ y: now.getFullYear(), m: now.getMonth() })

  const span = calendarSpan(view.y, view.m)
  const range = useMemo(() => {
    const from = parseYmd(span.first)
    from.setDate(from.getDate() - LOOKBACK_DAYS)
    const to = parseYmd(span.last)
    to.setDate(to.getDate() + 2)
    return { from: from.toISOString(), to: to.toISOString() }
  }, [span.first, span.last])
  const { data: trades = [], isLoading } = useTrades(range)

  const cal = useMemo(() => profitCalendar(closedTrades(trades.map((tr) => ({ ...tr, tagIds: [] }))), view.y, view.m, timeZone), [trades, view, timeZone])
  const shift = (n: number) => setView((v) => ({ y: new Date(v.y, v.m + n, 1).getFullYear(), m: new Date(v.y, v.m + n, 1).getMonth() }))
  const today = ymd(now)
  const winrate = (x: CalCell) => (x.count ? x.wins / x.count : 0)
  const m = cal.month

  return (
    <Card className="rise !p-4 [--i:1]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">{c.title}</h2>
        <div className="flex items-center gap-1 rounded-xl border border-border bg-surface-2/60 p-1">
          <NavBtn dir={-1} label={c.prev} onClick={() => shift(-1)} />
          <span className="min-w-36 text-center text-sm font-semibold capitalize">{monthTitle.format(new Date(view.y, view.m, 1))}</span>
          <NavBtn dir={1} label={c.next} onClick={() => shift(1)} />
        </div>
      </div>

      <div className={`mt-4 grid gap-1.5 ${wide ? 'grid-cols-[repeat(7,minmax(0,1fr))_minmax(0,1.1fr)]' : 'grid-cols-7'} ${isLoading ? 'opacity-60' : ''}`}>
        {t.period.weekdaysShort.map((w) => (
          <div key={w} className="pb-1 text-center text-xs text-muted">
            {w}
          </div>
        ))}
        {wide && <div className="pb-1 text-center text-xs text-muted">{c.week}</div>}

        {cal.weeks.map((week) => (
          <WeekRow key={week.days[0].date} days={week.days} total={week.total} wide={wide} today={today} />
        ))}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5 text-xs sm:text-sm">
        <Stat label={c.trades} value={String(m.count)} />
        <Stat label={c.winrate} value={m.count ? formatPercent(winrate(m), 1) : '—'} />
        <Stat label={c.result} value={m.count ? formatPnl(m.pnl) : '—'} tone={m.pnl > 0 ? 'text-profit' : m.pnl < 0 ? 'text-loss' : ''} />
      </div>
    </Card>
  )

  function WeekRow({ days, total, wide, today }: { days: CalDay[]; total: CalCell; wide: boolean; today: string }) {
    return (
      <>
        {days.map((d) => (
          <DayCell key={d.date} d={d} wide={wide} today={today} />
        ))}
        {wide && <TotalCell total={total} />}
      </>
    )
  }

  function DayCell({ d, wide, today }: { d: CalDay; wide: boolean; today: string }) {
    const k = tone(d)
    const bg = !d.inMonth
      ? 'cal-hatch border-transparent'
      : k === 'profit'
        ? 'border-profit/30 bg-profit/12'
        : k === 'loss'
          ? 'border-loss/30 bg-loss/12'
          : 'border-border bg-surface-2/60'
    const text = !d.inMonth ? 'text-muted' : k === 'profit' ? 'text-profit' : k === 'loss' ? 'text-loss' : 'text-muted'
    const title = d.count ? `${d.date}: ${formatPnl(d.pnl)} · ${plural(d.count, c.tradesN)} · ${formatPercent(d.wins / d.count, 0)}` : d.date
    return (
      <div
        title={title}
        className={`relative flex flex-col rounded-lg border text-center ${wide ? 'min-h-20 justify-center px-1 py-2' : 'min-h-14 justify-start px-0.5 pt-1 pb-1.5'} ${bg}`}
      >
        <span
          className={`flex items-center justify-center rounded-full ${wide ? 'absolute top-1 right-1 size-5 text-[11px]' : 'mx-auto size-5 text-[10px]'} ${
            d.date === today ? 'bg-primary font-semibold text-on-primary' : d.inMonth ? 'bg-bg/60 text-text' : 'text-muted'
          }`}
        >
          {d.day}
        </span>
        {d.count > 0 && (
          <>
            <span className={`num font-semibold ${wide ? 'mt-2 truncate text-sm' : 'mt-1 text-[10px] leading-tight tracking-tighter'} ${text} ${d.inMonth ? '' : 'opacity-70'}`}>
              {wide ? formatPnl(d.pnl) : compactPnl(d.pnl)}
            </span>
            {wide && (
              <span className={`mt-0.5 truncate text-[11px] ${d.inMonth ? 'text-text/80' : 'text-muted'}`}>
                {plural(d.count, c.tradesN)} · {formatPercent(d.wins / d.count, 0)}
              </span>
            )}
          </>
        )}
      </div>
    )
  }

  function TotalCell({ total }: { total: CalCell }) {
    const k = tone(total)
    const bg = k === 'profit' ? 'border-profit/30 bg-profit/12' : k === 'loss' ? 'border-loss/30 bg-loss/12' : 'border-border bg-surface-2/30'
    return (
      <div className={`flex min-h-20 flex-col items-center justify-center rounded-lg border px-1 py-2 text-center ${bg}`}>
        {total.count > 0 ? (
          <>
            <span className={`num truncate text-sm font-semibold ${k === 'profit' ? 'text-profit' : k === 'loss' ? 'text-loss' : 'text-muted'}`}>{formatPnl(total.pnl)}</span>
            <span className="mt-0.5 truncate text-[11px] text-text/80">
              {plural(total.count, c.tradesN)} · {formatPercent(total.wins / total.count, 0)}
            </span>
          </>
        ) : (
          <span className="text-xs text-muted">—</span>
        )}
      </div>
    )
  }
}

function Stat({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg bg-surface-2/60 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
      <span className="truncate text-muted">{label}</span>
      <span className={`num font-semibold whitespace-nowrap ${tone}`}>{value}</span>
    </div>
  )
}

function NavBtn({ dir, label, onClick }: { dir: 1 | -1; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-text">
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={dir < 0 ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
      </svg>
    </button>
  )
}
