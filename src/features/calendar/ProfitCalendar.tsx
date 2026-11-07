/**
 * «Календарь прибыли» (вкладка /calendar), в тон «Статистике»: прибыльный день — фиолетовый, убыточный — серый,
 * яркость клетки — по сумме дня относительно самого большого дня месяца (тепловая карта).
 * Справа (на телефоне — ниже) — итоги месяца: результат, торговые дни, лучший и худший день, недели, дни недели.
 * Свой месяц (стрелки), не зависит от фильтра периода. Дни соседних месяцев — заштрихованы.
 */
import { useMemo, useState, type CSSProperties } from 'react'
import { fmt, plural, useT } from '@/i18n'
import { useTrades } from '@/features/trades/api'
import { closedTrades } from '@/lib/calc/stats'
import { calendarSpan, compactPnl, monthSummary, profitCalendar, type CalCell, type CalDay } from '@/lib/calc/calendar'
import { formatDay, formatPercent, formatPnl } from '@/lib/format'
import { parseYmd, ymd } from '@/lib/period'
import { useMediaQuery } from '@/lib/useMediaQuery'

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
  const { data: trades = [], isLoading } = useTrades(range)

  const cal = useMemo(() => profitCalendar(closedTrades(trades.map((tr) => ({ ...tr, tagIds: [] }))), view.y, view.m, timeZone), [trades, view, timeZone])
  const sum = useMemo(() => monthSummary(cal), [cal])
  const shift = (n: number) => setView((v) => ({ y: new Date(v.y, v.m + n, 1).getFullYear(), m: new Date(v.y, v.m + n, 1).getMonth() }))
  const today = ymd(now)
  const m = cal.month

  return (
    // широкий экран (выбор владельца — вариант 2): высота ~86 % экрана, по краям небольшие поля (до 2000 px по центру);
    // панель итогов справа той же высоты, что и календарь
    <div className="rise mx-auto grid w-full max-w-[2000px] gap-4 xl:h-[86dvh] xl:min-h-[680px] xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="flex flex-col rounded-lg border border-border bg-surface p-4 sm:p-5 xl:h-full">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h1 className="text-lg font-semibold">{c.title}</h1>
            {m.count > 0 && <span className={`num text-sm font-semibold ${m.pnl < 0 ? 'text-down' : 'text-muted'}`}>{formatPnl(m.pnl)}</span>}
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-2/60 p-1">
            <NavBtn dir={-1} label={c.prev} onClick={() => shift(-1)} />
            <span className="min-w-36 text-center text-sm font-semibold">{monthLabel(view.y, view.m)}</span>
            <NavBtn dir={1} label={c.next} onClick={() => shift(1)} />
          </div>
        </div>

        <div className={`mt-4 grid flex-1 gap-1.5 ${wide ? 'grid-cols-[repeat(7,minmax(0,1fr))_minmax(0,1fr)] grid-rows-[auto_repeat(6,minmax(0,1fr))]' : 'grid-cols-7'} ${isLoading ? 'opacity-60' : ''}`}>
          {t.period.weekdaysShort.map((w) => (
            <div key={w} className="pb-1 text-center text-xs text-muted">
              {w}
            </div>
          ))}
          {wide && <div className="pb-1 text-center text-xs text-muted">{c.week}</div>}
          {cal.weeks.map((week) => (
            <Week key={week.days[0].date} days={week.days} total={week.total} />
          ))}
        </div>
      </section>

      <MonthPanel />
    </div>
  )

  function Week({ days, total }: { days: CalDay[]; total: CalCell }) {
    return (
      <>
        {days.map((d) => (
          <Day key={d.date} d={d} />
        ))}
        {wide && (
          <div className="flex min-h-24 flex-col items-center justify-center rounded-md border border-border bg-bg/40 px-1 py-2 text-center xl:min-h-28">
            {total.count > 0 ? (
              <>
                <span className={`num truncate text-sm font-semibold ${total.pnl >= 0 ? 'text-text' : 'text-down'}`}>{formatPnl(total.pnl)}</span>
                <span className="mt-0.5 truncate text-[11px] text-muted">{plural(total.count, c.tradesN)}</span>
              </>
            ) : (
              <span className="text-xs text-muted">—</span>
            )}
          </div>
        )}
      </>
    )
  }

  function Day({ d }: { d: CalDay }) {
    const title = d.count ? `${d.date}: ${formatPnl(d.pnl)} · ${plural(d.count, c.tradesN)} · ${formatPercent(d.wins / d.count, 0)}` : d.date
    const style = d.inMonth ? heat(d.pnl) : undefined
    const base = !d.inMonth ? 'cal-hatch border-transparent' : style ? '' : 'border-border bg-surface-2/40'
    return (
      <div
        title={title}
        style={style}
        className={`relative flex flex-col rounded-md border text-center transition-colors ${wide ? 'min-h-24 justify-center px-1 py-2 xl:min-h-28' : 'min-h-14 justify-start px-0.5 pt-1 pb-1.5'} ${base}`}
      >
        <span
          className={`flex items-center justify-center rounded-full ${wide ? 'absolute top-1.5 right-1.5 size-5 text-[11px]' : 'mx-auto size-5 text-[10px]'} ${
            d.date === today ? 'bg-primary font-semibold text-on-primary' : d.inMonth ? 'text-muted' : 'text-muted/50'
          }`}
        >
          {d.day}
        </span>
        {d.count > 0 && (
          <>
            <span className={`num font-semibold ${wide ? 'mt-2 truncate text-[15px]' : 'mt-1 text-[10px] leading-tight tracking-tighter'} ${d.inMonth ? 'text-text' : 'text-muted/70'}`}>
              {wide ? formatPnl(d.pnl) : compactPnl(d.pnl)}
            </span>
            {wide && (
              <span className={`mt-0.5 truncate text-[11px] ${d.inMonth ? 'text-text/70' : 'text-muted/60'}`}>
                {plural(d.count, c.tradesN)}
                <span className="hidden min-[1600px]:inline"> · {formatPercent(d.wins / d.count, 0)}</span>
              </span>
            )}
          </>
        )}
      </div>
    )
  }

  /** Итоги месяца: результат, торговые дни (плюс / минус), лучший и худший день, недели и дни недели полосками */
  function MonthPanel() {
    const weekMax = Math.max(1e-9, ...sum.weeks.map((w) => Math.abs(w?.pnl ?? 0)))
    const wdMax = Math.max(1e-9, ...sum.weekdays.map((w) => Math.abs(w.pnl)))
    const dayShare = sum.upDays + sum.downDays ? sum.upDays / (sum.upDays + sum.downDays) : 0
    return (
      <aside className="flex flex-col gap-3 xl:h-full">
        <section className="rounded-lg border border-border bg-surface p-4">
          {/* «Результат» и цифра — соседи: так их читают экранные читалки и находит тест */}
          <div>
            <div className="text-xs text-muted">{c.result}</div>
            <div className="num mt-1 text-3xl font-semibold">{m.count ? formatPnl(m.pnl) : '—'}</div>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-md bg-surface-2/50 px-3 py-2">
              <dt className="text-xs text-muted">{c.trades}</dt>
              <dd className="num mt-0.5 font-semibold">{m.count}</dd>
            </div>
            <div className="rounded-md bg-surface-2/50 px-3 py-2">
              <dt className="text-xs text-muted">{c.winrate}</dt>
              <dd className="num mt-0.5 font-semibold">{m.count ? formatPercent(m.wins / m.count, 0) : '—'}</dd>
            </div>
          </dl>
          {m.count === 0 && <p className="mt-3 text-sm text-muted">{c.empty}</p>}
        </section>

        {m.count > 0 && (
          <>
            <section className="rounded-lg border border-border bg-surface p-4">
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

            <section className="flex flex-col rounded-lg border border-border bg-surface p-4 xl:flex-1">
              <h2 className="text-xs text-muted">{c.byWeek}</h2>
              <div className="mt-2 grid gap-1.5 xl:flex-1 xl:content-evenly">
                {sum.weeks.map((w, i) =>
                  w === null ? null : (
                    <div key={i} className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-2 text-xs">
                      <span className="text-muted">{fmt(c.weekN, { n: i + 1 })}</span>
                      <Bar value={w.pnl} max={weekMax} />
                      <span className={`num w-20 text-right font-semibold ${w.pnl < 0 ? 'text-down' : ''}`}>{w.count ? formatPnl(w.pnl) : '—'}</span>
                    </div>
                  ),
                )}
              </div>
            </section>

            {/* «По неделям» и «По дням недели» делят остаток высоты — панель доходит до низа календаря */}
            <section className="flex flex-col rounded-lg border border-border bg-surface p-4 xl:flex-1">
              <h2 className="text-xs text-muted">{c.byWeekday}</h2>
              <div className="mt-3 grid h-24 grid-cols-7 items-end gap-1.5 xl:mt-auto xl:h-40">
                {sum.weekdays.map((w, i) => (
                  <div key={i} className="flex h-full flex-col items-center justify-end gap-1" title={w.count ? `${t.period.weekdaysShort[i]}: ${formatPnl(w.pnl)}` : undefined}>
                    <div className="flex w-full flex-1 items-end">
                      <i
                        className={`block w-full rounded-sm ${w.pnl >= 0 ? 'bg-up' : 'bg-down'}`}
                        style={{ height: w.count ? `${Math.max(6, (Math.abs(w.pnl) / wdMax) * 100)}%` : 2 }}
                      />
                    </div>
                    <span className="text-[10px] text-muted">{t.period.weekdaysShort[i]}</span>
                  </div>
                ))}
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
    <button type="button" onClick={onClick} aria-label={label} className="flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-text">
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={dir < 0 ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
      </svg>
    </button>
  )
}
