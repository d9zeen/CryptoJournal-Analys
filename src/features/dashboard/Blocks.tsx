/**
 * Блоки «Статистики» под кривой капитала:
 *  - «Последние сделки» — 5 строк (дата, пара, Long / Short, PnL), строка — ссылка на сделку, внизу «Все сделки →»;
 *  - «Мини-календарь» текущего месяца — только цвет дня (плюс / минус / пусто) и число, без сумм;
 *    клик по дню — /calendar?day=… (тот месяц и панель дня). Образец сетки — 21st.dev fullscreen-calendar.
 */
import { useMemo, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { fmt, useT } from '@/i18n'
import { Card } from '@/components/ui/Card'
import { SideBadge } from '@/components/SideBadge'
import { useTrades } from '@/features/trades/api'
import { closedTrades } from '@/lib/calc/stats'
import { calendarSpan, profitCalendar } from '@/lib/calc/calendar'
import { formatDay, formatDayShort, formatPnl, pnlClass } from '@/lib/format'
import { intlLocale } from '@/lib/locale'
import { parseYmd, ymd } from '@/lib/period'
import { zonedParts } from '@/lib/tz'
import type { TradeWithTags } from '@/types/db'

const RECENT_N = 5

/** Последние 5 закрытых сделок периода — новые сверху */
export function RecentTrades({ trades, timeZone, i = 0 }: { trades: TradeWithTags[]; timeZone: string; i?: number }) {
  const t = useT()
  const r = t.dashboard.recent
  const rows = useMemo(
    () =>
      trades
        .filter((tr) => tr.exit_at && tr.pnl !== null)
        .sort((a, b) => b.exit_at!.localeCompare(a.exit_at!))
        .slice(0, RECENT_N),
    [trades],
  )
  return (
    <Card data-shot="recent" className="rise flex h-full flex-col !p-4" style={{ '--i': i } as CSSProperties}>
      <h2 className="font-semibold">{r.title}</h2>
      <ul className="mt-2 flex-1 divide-y divide-border">
        {rows.map((tr) => (
          <li key={tr.id}>
            <Link to={`/trades/${tr.id}`} className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 text-sm transition-colors hover:bg-surface-2/60">
              <span className="flex min-w-0 items-center gap-2">
                <span className="num w-12 shrink-0 text-xs text-muted">{formatDayShort(zonedParts(tr.exit_at!, timeZone).date)}</span>
                <span className="truncate font-medium">{tr.title ?? tr.symbol}</span>
                <SideBadge side={tr.side} />
              </span>
              <span className={`num shrink-0 font-semibold whitespace-nowrap ${pnlClass(Number(tr.pnl))}`}>{formatPnl(Number(tr.pnl))}</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link to="/trades" className="mt-2 self-start text-sm text-primary hover:underline">
        {r.all} →
      </Link>
    </Card>
  )
}

const monthTitle = () => new Intl.DateTimeFormat(intlLocale(), { month: 'long', year: 'numeric' })

/** Мини-календарь текущего месяца: цвет дня и число */
export function MiniCalendar({ timeZone, i = 0 }: { timeZone: string; i?: number }) {
  const t = useT()
  const m = t.dashboard.mini
  const now = new Date()
  const y = now.getFullYear()
  const mo = now.getMonth()
  const span = calendarSpan(y, mo)
  // как в календаре: сделка могла открыться раньше месяца — грузим с запасом 60 дней
  const range = useMemo(() => {
    const from = parseYmd(span.first)
    from.setDate(from.getDate() - 60)
    const to = parseYmd(span.last)
    to.setDate(to.getDate() + 2)
    return { from: from.toISOString(), to: to.toISOString() }
  }, [span.first, span.last])
  const { data: trades = [] } = useTrades(range)
  const cal = useMemo(() => profitCalendar(closedTrades(trades.map((tr) => ({ ...tr, tagIds: [] }))), y, mo, timeZone), [trades, y, mo, timeZone])
  const today = ymd(now)
  const title = monthTitle().format(new Date(y, mo, 1)).replace(/\s*г\.?$/, '')

  return (
    <Card data-shot="mini-calendar" className="rise flex h-full flex-col !p-4" style={{ '--i': i } as CSSProperties}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold first-letter:uppercase">{title}</h2>
        <Link to="/calendar" className="text-sm text-primary hover:underline">
          {m.open} →
        </Link>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs text-muted">
        {t.period.weekdaysShort.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="mt-1 grid flex-1 auto-rows-fr grid-cols-7 gap-1">
        {cal.weeks
          .flatMap((w) => w.days)
          .map((d) => {
            if (!d.inMonth) return <span key={d.date} aria-hidden />
            const tone = d.count === 0 ? 'border-border bg-surface-2/40 text-muted' : d.pnl >= 0 ? 'border-up/45 bg-up/18' : 'border-down/45 bg-down/18'
            const cls = `flex min-h-8 items-center justify-center rounded-md border text-xs font-medium ${tone} ${d.date === today ? 'ring-2 ring-primary' : ''}`
            if (d.date > today)
              return (
                <span key={d.date} data-future className={`${cls} opacity-50`}>
                  {d.day}
                </span>
              )
            return (
              <Link
                key={d.date}
                to={`/calendar?day=${d.date}`}
                data-day={d.date}
                aria-label={fmt(m.day, { day: formatDay(d.date) })}
                className={`${cls} cal-day-link`}
              >
                {d.day}
              </Link>
            )
          })}
      </div>
    </Card>
  )
}
