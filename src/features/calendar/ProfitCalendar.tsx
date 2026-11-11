/**
 * «Календарь прибыли» (вкладка /calendar), в тон «Статистике»: прибыльный день — фиолетовый, убыточный — серый,
 * яркость клетки — по сумме дня относительно самого большого дня месяца (тепловая карта).
 * Справа (на телефоне — ниже) — итоги месяца: результат, торговые дни, лучший и худший день, недели, дни недели.
 * Свой месяц (стрелки), не зависит от фильтра периода. Дни соседних месяцев — заштрихованы.
 */
import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { fmt, plural, useT } from '@/i18n'
import { useTrades } from '@/features/trades/api'
import { closedTrades } from '@/lib/calc/stats'
import { calendarSpan, compactPnl, monthSummary, monthWeeks, profitCalendar, type CalCell, type CalDay } from '@/lib/calc/calendar'
import { formatDay, formatPercent, formatPnl } from '@/lib/format'
import { parseYmd, ymd } from '@/lib/period'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { AnimatedNumber } from '@/components/AnimatedNumber'
import { CalendarSkeleton } from '@/components/Skeleton'

const monthTitle = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' })
/** «Ноябрь 2026» — без «г.» и без CSS capitalize (он делал «2026 Г.») */
const monthLabel = (y: number, m: number) => {
  const s = monthTitle.format(new Date(y, m, 1)).replace(/\s*г\.?$/, '')
  return s.charAt(0).toUpperCase() + s.slice(1)
}
/** сделка могла открыться задолго до закрытия — грузим с запасом */
const LOOKBACK_DAYS = 60

/** Фон клетки: «плюс» (--color-up) или «минус» (--color-down) — один ровный оттенок, без яркости по сумме (выбор владельца 07.11.2026) */
function heat(pnl: number): CSSProperties | undefined {
  if (!pnl) return undefined
  const color = pnl > 0 ? 'var(--color-up)' : 'var(--color-down)'
  return { backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`, borderColor: `color-mix(in srgb, ${color} 45%, transparent)` }
}

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
  const { data: trades = [], isLoading, isPlaceholderData } = useTrades(range)
  // месяц, чьи сделки уже на экране: волна клеток (№11) и прокрутка итога — когда пришли данные нового месяца
  const monthKey = `${view.y}-${view.m}`
  const shownMonth = useRef(monthKey)
  if (!isLoading && !isPlaceholderData) shownMonth.current = monthKey

  const cal = useMemo(() => profitCalendar(closedTrades(trades.map((tr) => ({ ...tr, tagIds: [] }))), view.y, view.m, timeZone), [trades, view, timeZone])
  const sum = useMemo(() => monthSummary(cal), [cal])
  const shift = (n: number) => setView((v) => ({ y: new Date(v.y, v.m + n, 1).getFullYear(), m: new Date(v.y, v.m + n, 1).getMonth() }))
  const today = ymd(now)
  const m = cal.month
  // №14: первая загрузка — заготовка сетки вместо пустоты
  if (isLoading) return <CalendarSkeleton />

  return (
    // широкий экран (выбор владельца — вариант 2): высота ~86 % экрана, по краям небольшие поля (до 2000 px по центру);
    // панель итогов справа той же высоты, что и календарь
    <div data-shot="calendar" className="mx-auto grid w-full max-w-[2000px] gap-4 xl:min-h-[max(680px,86dvh)] xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rise flex flex-col rounded-lg border border-border bg-surface p-4 sm:p-5 xl:h-full">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-semibold">{c.title}</h1>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-2/60 p-1">
            <NavBtn dir={-1} label={c.prev} onClick={() => shift(-1)} />
            <span className="min-w-36 text-center text-sm font-semibold">{monthLabel(view.y, view.m)}</span>
            <NavBtn dir={1} label={c.next} onClick={() => shift(1)} />
          </div>
        </div>

        {/* рядов столько, сколько недель у месяца (4–6), под ними — итог месяца */}
        <div
          key={shownMonth.current}
          className={`mt-4 grid flex-1 gap-1.5 ${wide ? 'grid-cols-[repeat(7,minmax(0,1fr))_minmax(0,1fr)]' : 'grid-cols-7'} ${isLoading || isPlaceholderData ? 'opacity-60' : ''}`}
          style={wide ? { gridTemplateRows: `auto repeat(${cal.weeks.length}, minmax(0, 1fr)) auto` } : undefined}
        >
          {t.period.weekdaysShort.map((w) => (
            <div key={w} className="pb-1 text-center text-xs text-muted">
              {w}
            </div>
          ))}
          {wide && <div className="pb-1 text-center text-xs text-muted">{c.week}</div>}
          {cal.weeks.map((week, row) => (
            <Week key={week.days[0].date} days={week.days} total={week.total} row={row} />
          ))}
          <MonthTotal />
        </div>
      </section>

      <MonthPanel />
    </div>
  )

  function Week({ days, total, row }: { days: CalDay[]; total: CalCell; row: number }) {
    return (
      <>
        {days.map((d, col) => (
          <Day key={d.date} d={d} k={row + col} />
        ))}
        {wide && (
          <div
            style={{ '--k': row + 7 } as CSSProperties}
            className="cell-in flex min-h-24 flex-col items-center justify-center rounded-md border border-border bg-bg/40 px-1 py-2 text-center xl:min-h-28"
          >
            {total.count > 0 ? (
              <>
                <span className={`num truncate text-sm font-semibold ${total.pnl >= 0 ? 'text-text' : 'text-down'}`}>{formatPnl(total.pnl)}</span>
                <span className="mt-0.5 truncate text-xs text-muted">{plural(total.count, c.tradesN)}</span>
              </>
            ) : (
              <span className="text-xs text-muted">—</span>
            )}
          </div>
        )}
      </>
    )
  }

  /** Строка «Итог месяца» под сеткой: результат, сделки, винрейт, самая прибыльная и самая убыточная сделка */
  function MonthTotal() {
    const items: { label: string; value: string; tone?: string }[] = [
      { label: c.trades, value: String(m.count) },
      { label: c.winrate, value: m.count ? formatPercent(m.wins / m.count, 0) : '—' },
      { label: c.maxWin, value: m.best === null ? '—' : formatPnl(m.best), tone: m.best === null ? '' : 'text-up' },
      { label: c.maxLoss, value: m.worst === null ? '—' : formatPnl(m.worst), tone: m.worst === null ? '' : 'text-down' },
    ]
    return (
      <div
        data-shot="month-total"
        className={`flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-border bg-bg/40 px-4 py-3 ${wide ? 'col-span-8' : 'col-span-7 mt-1'}`}
      >
        <div className="flex items-baseline gap-3">
          <span className="text-sm font-semibold">{c.monthTotal}</span>
          <span className={`num text-lg font-semibold ${m.count === 0 ? 'text-muted' : m.pnl >= 0 ? 'text-up' : 'text-down'}`}>
            {/* №8: итог набегает при первом показе, при смене месяца прокручивается */}
            {m.count ? <AnimatedNumber value={m.pnl} format={formatPnl} rollKey={shownMonth.current} /> : '—'}
          </span>
        </div>
        <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm sm:ml-auto">
          {items.map((it) => (
            <div key={it.label} className="flex items-baseline gap-2">
              <dt className="text-xs text-muted">{it.label}</dt>
              <dd className={`num font-semibold ${it.tone ?? ''}`}>{it.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    )
  }

  /**
   * День. №11: клетки появляются волной по диагонали (--k = столбец + строка), при смене месяца — заново (key сетки).
   * День со сделками — кнопка: клик открывает «Сделки» с фильтром на этот день; при наведении клетка приподнимается.
   */
  function Day({ d, k }: { d: CalDay; k: number }) {
    // дни соседних месяцев — пустое место: ряд просто заканчивается на последнем дне месяца
    if (!d.inMonth) return <div aria-hidden className={wide ? 'min-h-24 xl:min-h-28' : 'min-h-14'} />
    const title = d.count ? `${formatDay(d.date)}: ${formatPnl(d.pnl)} · ${plural(d.count, c.tradesN)}` : formatDay(d.date)
    const style = { ...heat(d.pnl), '--k': k } as CSSProperties
    const base = d.count ? '' : 'border-border bg-surface-2/40'
    const cls = `cell-in relative flex flex-col rounded-md border text-center ${wide ? 'min-h-24 justify-center px-1 py-2 xl:min-h-28' : 'min-h-14 justify-start px-0.5 pt-1 pb-1.5'} ${base}`
    const inner = (
      <>
        <span
          className={`flex items-center justify-center rounded-full ${wide ? 'absolute top-1.5 right-1.5 size-5 text-xs' : 'mx-auto size-5 text-xs'} ${
            d.date === today ? 'bg-primary font-semibold text-on-primary' : d.inMonth ? 'text-muted' : 'text-muted/50'
          }`}
        >
          {d.day}
        </span>
        {d.count > 0 && (
          <>
            <span
              className={`num font-semibold ${wide ? 'mt-2 truncate text-[15px]' : 'mt-1 text-xs leading-tight tracking-tighter'} ${d.inMonth ? 'text-text' : 'text-muted/70'}`}
            >
              {wide ? formatPnl(d.pnl) : compactPnl(d.pnl)}
            </span>
            {wide && <span className={`mt-0.5 truncate text-xs ${d.inMonth ? 'text-text/70' : 'text-muted/60'}`}>{plural(d.count, c.tradesN)}</span>}
          </>
        )}
      </>
    )
    if (!d.count)
      return (
        <div title={title} style={style} className={cls}>
          {inner}
        </div>
      )
    return (
      <Link to={`/trades?day=${d.date}`} title={title} aria-label={fmt(c.openDay, { day: title })} style={style} className={`${cls} cal-day-link`}>
        {inner}
      </Link>
    )
  }

  /** Итоги месяца: результат, торговые дни (плюс / минус), лучший и худший день, недели и дни недели полосками */
  function MonthPanel() {
    // недели по рядам календаря, огрызки короче 4 дней приклеены к соседней (выбор владельца 07.11.2026)
    const weeks = monthWeeks(cal, 'merge')
    const mon = c.monthsShort[view.m]
    const weekLabel = (from: number, to: number) => (from === to ? `${from} ${mon}` : `${from}–${to} ${mon}`)
    const weekMax = Math.max(1e-9, ...weeks.map((w) => Math.abs(w.cell.pnl)))
    const wdMax = Math.max(1e-9, ...sum.weekdays.map((w) => Math.abs(w.pnl)))
    const dayShare = sum.upDays + sum.downDays ? sum.upDays / (sum.upDays + sum.downDays) : 0
    return (
      <aside className="flex flex-col gap-3 xl:h-full">
        {m.count === 0 && (
          <section style={{ '--i': 1 } as CSSProperties} className="rise rounded-lg border border-border bg-surface p-4">
            <p className="text-sm text-muted">{c.empty}</p>
          </section>
        )}

        {m.count > 0 && (
          <>
            <section style={{ '--i': 2 } as CSSProperties} className="rise rounded-lg border border-border bg-surface p-4">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-muted">{c.days}</span>
                <span className="num font-semibold">{sum.tradedDays}</span>
              </div>
              <div className="mt-2 flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-surface-2">
                <i className="block bg-up" style={{ flex: dayShare }} />
                <i className="block bg-down" style={{ flex: 1 - dayShare }} />
              </div>
              <div className="mt-1.5 text-xs text-muted">{fmt(c.daysUpDown, { up: sum.upDays, down: sum.downDays })}</div>
              <dl className="mt-4 grid gap-2 text-sm">
                {sum.best && <Row label={c.bestDay} sub={formatDay(sum.best.date)} value={formatPnl(sum.best.pnl)} />}
                {sum.worst && <Row label={c.worstDay} sub={formatDay(sum.worst.date)} value={formatPnl(sum.worst.pnl)} down={sum.worst.pnl < 0} />}
                {sum.avgDay !== null && <Row label={c.avgDay} value={formatPnl(sum.avgDay)} />}
              </dl>
            </section>

            <section style={{ '--i': 3 } as CSSProperties} className="rise flex flex-col rounded-lg border border-border bg-surface p-4 xl:flex-1">
              <h2 className="text-xs text-muted">{c.byWeek}</h2>
              <div className="mt-2 grid gap-1.5 xl:flex-1 xl:content-evenly">
                {weeks.map((w) => (
                  <div key={w.from} className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-2 text-xs">
                    <span className="num text-muted">{weekLabel(w.from, w.to)}</span>
                    <Bar value={w.cell.pnl} max={weekMax} />
                    <span className={`num w-20 text-right font-semibold ${w.cell.pnl < 0 ? 'text-down' : ''}`}>
                      {w.cell.count ? formatPnl(w.cell.pnl) : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* «По неделям» и «По дням недели» делят остаток высоты — панель доходит до низа календаря */}
            <section style={{ '--i': 4 } as CSSProperties} className="rise flex flex-col rounded-lg border border-border bg-surface p-4 xl:flex-1">
              <h2 className="text-xs text-muted">{c.byWeekday}</h2>
              {/* линия нуля посередине: прибыль вверх, убыток вниз, сумма над / под столбиком; дни без сделок — «—» */}
              <div className="relative mt-3 grid h-44 grid-cols-7 gap-1.5 xl:mt-auto xl:h-52">
                <i aria-hidden className="pointer-events-none absolute inset-x-0 top-[calc(50%-0.625rem)] border-t border-border" />
                {sum.weekdays.map((w, i) => {
                  const h = w.count ? `${Math.max(4, (Math.abs(w.pnl) / wdMax) * 70)}%` : 0
                  const up = w.pnl >= 0
                  const label = <span className={`num text-xs leading-none font-semibold ${up ? 'text-text' : 'text-down'}`}>{compactPnl(w.pnl)}</span>
                  return (
                    <div
                      key={i}
                      className="flex h-full min-w-0 flex-col items-center"
                      title={w.count ? `${t.period.weekdaysShort[i]}: ${formatPnl(w.pnl)}` : undefined}
                    >
                      <div className="flex w-full flex-1 flex-col items-center justify-end gap-1">
                        {w.count > 0 && up && (
                          <>
                            {label}
                            <i className="block w-full rounded-t-sm bg-up" style={{ height: h }} />
                          </>
                        )}
                      </div>
                      <div className="flex w-full flex-1 flex-col items-center justify-start gap-1">
                        {w.count > 0 && !up && (
                          <>
                            <i className="block w-full rounded-b-sm bg-down" style={{ height: h }} />
                            {label}
                          </>
                        )}
                        {w.count === 0 && <span className="-mt-2.5 text-xs text-muted">—</span>}
                      </div>
                      <span className="mt-1 text-xs text-muted">{t.period.weekdaysShort[i]}</span>
                    </div>
                  )
                })}
              </div>
            </section>
          </>
        )}
      </aside>
    )
  }
}

function Row({ label, sub, value, down = false }: { label: string; sub?: string; value: string; down?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">
        {label}
        {sub && <span className="ml-1.5 text-xs text-muted/70">{sub}</span>}
      </dt>
      <dd className={`num font-semibold ${down ? 'text-down' : ''}`}>{value}</dd>
    </div>
  )
}

/** Полоска от нуля: плюс — фиолетовая вправо, минус — серая влево */
function Bar({ value, max }: { value: number; max: number }) {
  const w = (Math.abs(value) / max) * 50
  return (
    <div className="relative h-1.5 rounded-full bg-surface-2">
      <i className="absolute inset-y-[-3px] left-1/2 w-px bg-border" aria-hidden />
      <i className={`absolute inset-y-0 rounded-full ${value < 0 ? 'right-1/2 bg-down' : 'left-1/2 bg-up'}`} style={{ width: `${w}%` }} />
    </div>
  )
}

function NavBtn({ dir, label, onClick }: { dir: 1 | -1; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-text"
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={dir < 0 ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
      </svg>
    </button>
  )
}
