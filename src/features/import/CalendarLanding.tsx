/**
 * Анимация E «В календарь» — итог загрузки файла (образец сетки — 21st.dev integrations-4):
 * из галочки по одному вылетают квадратики и садятся в свои дни месяца, день окрашивается цветом результата.
 * Месяц — тот, где последняя загруженная сделка (в часовом поясе пользователя); суммы — по загруженным сделкам.
 * Только transform / opacity (полёт) и смена фона дня; при «уменьшить движение» — сразу итог.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { fmt, plural, useT } from '@/i18n'
import { CheckMark } from '@/components/CheckMark'
import { formatNumber, formatPnl, pnlClass } from '@/lib/format'
import { intlLocale } from '@/lib/locale'
import { prefersReducedMotion } from '@/lib/motion'
import { zonedParts } from '@/lib/tz'
import { monthSummary, profitCalendar } from '@/lib/calc/calendar'
import type { ImportedTrade } from '@/lib/import/types'

const STEP_MS = 90
const FLIGHT_MS = 650

export function CalendarLanding({
  trades,
  inserted,
  duplicates,
  timeZone,
}: {
  trades: ImportedTrade[]
  inserted: number
  duplicates: number
  timeZone: string
}) {
  const t = useT()
  const l = t.import.landing
  const latest = useMemo(() => trades.reduce((m, x) => (x.exit_at > m ? x.exit_at : m), ''), [trades])
  const cal = useMemo(() => {
    if (!latest) return null
    const { date } = zonedParts(latest, timeZone)
    const [y, m] = date.split('-').map(Number)
    return { year: y, month: m - 1, lastDay: date, data: profitCalendar(trades, y, m - 1, timeZone) }
  }, [trades, latest, timeZone])
  const days = useMemo(() => (cal ? cal.data.weeks.flatMap((w) => w.days) : []), [cal])
  const active = useMemo(() => days.filter((d) => d.inMonth && d.count > 0).map((d) => d.date), [days])
  const otherMonths = trades.length - (cal?.data.month.count ?? 0)
  const summary = useMemo(() => (cal ? monthSummary(cal.data) : null), [cal])

  const boxRef = useRef<HTMLDivElement>(null)
  const fromRef = useRef<HTMLDivElement>(null)
  const [landed, setLanded] = useState<Set<string>>(() => (prefersReducedMotion() ? new Set(active) : new Set()))

  // полёт: квадратик из галочки в свой день; день окрашивается, когда квадратик долетел
  useEffect(() => {
    const box = boxRef.current
    const from = fromRef.current
    if (!box || !from || prefersReducedMotion()) {
      setLanded(new Set(active))
      return
    }
    const timers: number[] = []
    const flyers: HTMLElement[] = []
    const b = box.getBoundingClientRect()
    const f = from.getBoundingClientRect()
    const x0 = f.left - b.left + f.width / 2 - 4
    const y0 = f.top - b.top + f.height / 2 - 4
    active.forEach((date, k) => {
      timers.push(
        window.setTimeout(() => {
          const cell = box.querySelector<HTMLElement>(`[data-cal-day="${date}"]`)
          if (!cell) return
          const r = cell.getBoundingClientRect()
          const el = document.createElement('span')
          el.className = 'cal-flyer'
          el.style.left = `${x0}px`
          el.style.top = `${y0}px`
          box.appendChild(el)
          flyers.push(el)
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              el.style.transform = `translate(${r.left - b.left + r.width / 2 - 4 - x0}px, ${r.top - b.top + r.height / 2 - 4 - y0}px) scale(0.6)`
            }),
          )
          timers.push(
            window.setTimeout(() => {
              el.style.opacity = '0'
              setLanded((s) => new Set(s).add(date))
            }, FLIGHT_MS),
          )
        }, 300 + k * STEP_MS),
      )
    })
    return () => {
      timers.forEach(clearTimeout)
      flyers.forEach((el) => el.remove())
    }
  }, [active])

  if (!cal) return null
  const monthName = new Intl.DateTimeFormat(intlLocale(), { month: 'long', year: 'numeric' }).format(new Date(cal.year, cal.month, 15))
  const dows = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(intlLocale(), { weekday: 'short' }).format(new Date(2024, 0, 1 + i)))
  const done = landed.size >= active.length

  return (
    <div
      ref={boxRef}
      role="status"
      data-import-done
      data-landed={done ? 'all' : 'flying'}
      className="rise relative grid gap-5 rounded-xl border border-up/40 bg-surface p-4 sm:p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,400px)] md:items-start xl:grid-cols-[minmax(0,1fr)_minmax(0,460px)]"
    >
      <div className="flex min-w-0 flex-col gap-2">
        <div ref={fromRef} className="self-start">
          <CheckMark circle className="size-10 text-up" />
        </div>
        <p className="font-semibold">
          {fmt(t.import.done, { n: inserted })}
          {duplicates > 0 && ` ${fmt(t.import.doneDuplicates, { n: duplicates })}`}
        </p>
        <p className="text-sm text-muted">
          {fmt(l.month, { month: monthName })}:{' '}
          <span className={`num font-semibold ${pnlClass(cal.data.month.pnl)}`}>{formatPnl(cal.data.month.pnl)}</span>
          {' · '}
          {plural(cal.data.month.count, t.dashboard.calendar.tradesN)}
        </p>
        {summary && (
          <div className="mt-1 flex flex-wrap gap-2 text-xs">
            <span className="num rounded-full bg-up/12 px-2.5 py-1 text-up">{fmt(l.daysUp, { n: summary.upDays })}</span>
            <span className="num rounded-full bg-down/12 px-2.5 py-1 text-down">{fmt(l.daysDown, { n: summary.downDays })}</span>
            {summary.best && (
              <span className="num rounded-full bg-surface-2 px-2.5 py-1 text-muted">
                {fmt(l.bestDay, { day: new Intl.DateTimeFormat(intlLocale(), { day: 'numeric', month: 'short' }).format(new Date(`${summary.best.date}T12:00`)), pnl: formatPnl(summary.best.pnl) })}
              </span>
            )}
          </div>
        )}
        {otherMonths > 0 && <p className="text-xs text-muted">{fmt(l.otherMonths, { n: formatNumber(otherMonths, 0) })}</p>}
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-sm">
          <Link to={`/calendar?day=${cal.lastDay}`} className="font-medium text-primary hover:underline">
            {l.openCalendar} →
          </Link>
          {inserted > 0 && (
            <Link to="/trades" className="text-primary hover:underline">
              {t.import.toTrades} →
            </Link>
          )}
        </div>
      </div>

      <div className="min-w-0">
        <p className="mb-2 text-sm font-semibold first-letter:uppercase">{monthName}</p>
        <div className="grid grid-cols-7 gap-1">
          {dows.map((d) => (
            <span key={d} className="text-center text-xs text-muted">
              {d}
            </span>
          ))}
          {days.map((d) => {
            const lit = d.inMonth && d.count > 0 && landed.has(d.date)
            const tone = !lit ? 'bg-surface-2/60 text-muted' : d.pnl > 0 ? 'bg-up/18 text-up' : d.pnl < 0 ? 'bg-down/18 text-down' : 'bg-surface-2 text-text'
            return (
              <span
                key={d.date}
                data-cal-day={d.date}
                data-lit={lit || undefined}
                title={d.count ? `${d.date}: ${formatPnl(d.pnl)}` : undefined}
                className={`num aspect-[2] rounded-md p-1 text-xs leading-none transition-colors duration-300 ${d.inMonth ? tone : 'opacity-0'}`}
              >
                {d.day}
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}
