/**
 * «Календарь прибыли» (вкладка /calendar), в тон «Статистике»: прибыльный день — фиолетовый, убыточный — серый,
 * яркость клетки — по сумме дня относительно самого большого дня месяца (тепловая карта).
 * Справа (на телефоне — ниже) — итоги месяца: на широком экране (xl) первой карточкой «Итог месяца» (результат, сделки, винрейт,
 * лучшая / худшая сделка; рамка цвета кнопок), затем торговые дни, лучший и худший день, недели, дни недели.
 * Уже xl «Итог месяца» — строкой сразу под сеткой. Полоска палитры (PaletteStrip) — всегда под календарём.
 * Свой месяц (стрелки + «Сегодня», образец шапки — 21st.dev fullscreen-calendar), не зависит от фильтра периода.
 * Будущие дни — бледные и не нажимаются. Клик по дню — панель дня (DayPanel): итог, сделки, заметка дня (Pro Plus).
 * ?day=YYYY-MM-DD в адресе (мини-календарь на «Статистике») — сразу этот месяц и панель дня.
 */
import { intlLocale } from '@/lib/locale'
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'react-router'
import { fmt, plural, useT } from '@/i18n'
import { useTrades } from '@/features/trades/api'
import { closedTrades } from '@/lib/calc/stats'
import { calendarSpan, compactPnl, monthPairs, monthSummary, monthWeeks, profitCalendar, type CalCell, type CalDay, type MonthPairs } from '@/lib/calc/calendar'
import { formatDay, formatPercent, formatPnl, formatPnlShort } from '@/lib/format'
import { parseYmd } from '@/lib/period'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { AnimatedNumber } from '@/components/AnimatedNumber'
import { CalendarSkeleton } from '@/components/Skeleton'
import { PaletteStrip } from '@/features/palette/PaletteStrip'
import { zonedParts } from '@/lib/tz'
import { useGlare } from '@/lib/motion'
import { DayPanel, type DayTrade } from './DayPanel'
import { CoinChip } from '@/features/portfolio/CoinChip'

const monthTitle = () => new Intl.DateTimeFormat(intlLocale(), { month: 'long', year: 'numeric' })
/** «Ноябрь 2026» — без «г.» и без CSS capitalize (он делал «2026 Г.») */
const monthLabel = (y: number, m: number) => {
  const s = monthTitle().format(new Date(y, m, 1)).replace(/\s*г\.?$/, '')
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
  // широкий экран (xl): «Итог месяца» — в правой колонке, над «Торговые дни»; уже — строкой под сеткой
  const side = useMediaQuery('(min-width: 1280px)')
  // «сегодня» и текущий месяц — в поясе пользователя, как и сами дни (иначе сегодняшние сделки могли оказаться в «будущем» дне)
  const todayZ = zonedParts(new Date().toISOString(), timeZone).date
  const now = { getFullYear: () => Number(todayZ.slice(0, 4)), getMonth: () => Number(todayZ.slice(5, 7)) - 1 }
  // ?day=2026-11-04 — открыть этот месяц и панель дня (клик в мини-календаре на «Статистике»)
  const [params, setParams] = useSearchParams()
  const dayParam = /^\d{4}-\d{2}-\d{2}$/.test(params.get('day') ?? '') ? params.get('day')! : null
  const [view, setView] = useState(() => (dayParam ? { y: Number(dayParam.slice(0, 4)), m: Number(dayParam.slice(5, 7)) - 1 } : { y: now.getFullYear(), m: now.getMonth() }))
  const [openDay, setOpenDay] = useState<string | null>(dayParam)
  const closeDay = () => {
    setOpenDay(null)
    if (params.has('day')) setParams({}, { replace: true })
  }
  const isCurrentMonth = view.y === now.getFullYear() && view.m === now.getMonth()

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
  const panelRef = useRef<HTMLElement>(null)
  useGlare(panelRef) // №4 «Блик и наклон» на «Итоге месяца»
  if (!isLoading && !isPlaceholderData) shownMonth.current = monthKey

  const closed = useMemo(() => closedTrades(trades.map((tr) => ({ ...tr, tagIds: [] }))), [trades])
  const cal = useMemo(() => profitCalendar(closed, view.y, view.m, timeZone), [closed, view, timeZone])
  const pairs = useMemo(() => monthPairs(closed, view.y, view.m, timeZone), [closed, view, timeZone])
  const sum = useMemo(() => monthSummary(cal), [cal])
  const shift = (n: number) => setView((v) => ({ y: new Date(v.y, v.m + n, 1).getFullYear(), m: new Date(v.y, v.m + n, 1).getMonth() }))
  const today = todayZ
  const m = cal.month
  // сделки открытого дня — для панели (день — дата закрытия в часовом поясе пользователя, как в клетках)
  const dayTrades: DayTrade[] = openDay
    ? trades
        .filter((tr) => tr.exit_at && tr.pnl !== null && zonedParts(tr.exit_at, timeZone).date === openDay)
        .map((tr) => ({ id: tr.id, symbol: tr.symbol, title: tr.title, side: tr.side, exit_at: tr.exit_at!, pnl: tr.pnl! }))
        .sort((a, b) => a.exit_at.localeCompare(b.exit_at))
    : []
  // №14: первая загрузка — заготовка сетки вместо пустоты
  if (isLoading) return <CalendarSkeleton />

  return (
    // широкий экран (выбор владельца — вариант 2): высота ~86 % экрана, по краям небольшие поля (до 2000 px по центру);
    // панели итогов справа — колонка 320px до низа календаря (последняя карточка «Пары месяца» тянется) — остальное место у календаря
    <div data-shot="calendar" className="mx-auto grid w-full max-w-[2000px] gap-4 xl:min-h-[max(680px,86dvh)] xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="rise flex flex-col rounded-lg border border-border bg-surface p-4 sm:p-5 xl:h-full">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-semibold">{c.title}</h1>
          <div className="flex items-center gap-2">
            {/* «Сегодня» — вернуться на текущий месяц; на нём самом кнопки нет */}
            {!isCurrentMonth && (
              <button
                type="button"
                onClick={() => setView({ y: now.getFullYear(), m: now.getMonth() })}
                className="rounded-lg border border-border bg-surface-2/60 px-3 py-1.5 text-sm font-medium transition-colors hover:border-primary hover:text-primary"
              >
                {c.today}
              </button>
            )}
            <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-2/60 p-1">
              <NavBtn dir={-1} label={c.prev} onClick={() => shift(-1)} />
              <span className="min-w-36 text-center text-sm font-semibold">{monthLabel(view.y, view.m)}</span>
              <NavBtn dir={1} label={c.next} onClick={() => shift(1)} />
            </div>
          </div>
        </div>

        {/* рядов столько, сколько недель у месяца (4–6), под ними — итог месяца */}
        <div
          key={shownMonth.current}
          className={`mt-4 grid flex-1 gap-1.5 ${wide ? 'grid-cols-[repeat(7,minmax(0,1fr))_minmax(0,1fr)]' : 'grid-cols-7'} ${isLoading || isPlaceholderData ? 'opacity-60' : ''}`}
          style={wide ? { gridTemplateRows: `auto repeat(${cal.weeks.length}, minmax(0, 1fr))${side ? '' : ' auto'}` } : undefined}
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
          {!side && <MonthTotal />}
        </div>
        {/* цвета плюса и минуса — прямо под календарём (и в «Настройки → Оформление»): выбор сразу перекрашивает клетки */}
        <div className="mt-3">
          <PaletteStrip inline />
        </div>
      </section>

      <MonthPanel />
      {openDay && <DayPanel key={openDay} day={openDay} trades={dayTrades} timeZone={timeZone} onClose={closeDay} />}
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
                <span className={`num text-xs font-semibold whitespace-nowrap xl:text-sm ${total.pnl >= 0 ? 'text-text' : 'text-down'}`}>{formatPnl(total.pnl)}</span>
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
              className={`num font-semibold whitespace-nowrap ${wide ? 'mt-2 text-sm xl:text-[15px]' : 'mt-1 text-xs leading-tight tracking-tighter'} ${d.inMonth ? 'text-text' : 'text-muted/70'}`}
            >
              {/* в клетке — короткая сумма без копеек (полная — в подсказке title); итоги недели и месяца — полные */}
              {wide ? formatPnlShort(d.pnl) : compactPnl(d.pnl)}
            </span>
            {wide && <span className={`mt-0.5 truncate text-xs ${d.inMonth ? 'text-text/70' : 'text-muted/60'}`}>{plural(d.count, c.tradesN)}</span>}
          </>
        )}
      </>
    )
    // будущие дни — бледные, без наведения и не нажимаются
    if (d.date > today)
      return (
        <div data-future title={title} style={style} className={`${cls} opacity-50`}>
          {inner}
        </div>
      )
    // прошедший день (со сделками или без — заметку можно оставить и в пустой день) — открывает панель дня
    return (
      <button
        type="button"
        data-day={d.date}
        title={title}
        aria-label={fmt(c.openDay, { day: title })}
        onClick={() => setOpenDay(d.date)}
        style={style}
        className={`${cls} cal-day-link cursor-pointer`}
      >
        {inner}
      </button>
    )
  }

  /** «Итог месяца» в правой колонке (xl): результат крупно, «16 сделок · винрейт 50 %», лучшая / худшая сделка; рамка — цвет кнопок */
  function MonthTotalCard() {
    return (
      <section data-shot="month-total" data-glare style={{ '--i': 0 } as CSSProperties} className="rise relative overflow-hidden rounded-lg border border-primary bg-surface p-5">
        <span aria-hidden className="glare-shine" />
        <h2 className="text-sm text-muted">{c.monthTotal}</h2>
        <div className={`num mt-1 text-4xl font-semibold ${m.count === 0 ? 'text-muted' : m.pnl >= 0 ? 'text-up' : 'text-down'}`}>
          {m.count ? <AnimatedNumber value={m.pnl} format={formatPnl} rollKey={shownMonth.current} /> : '—'}
        </div>
        <p className="mt-1 text-sm text-muted">
          {fmt(c.monthLine, { trades: plural(m.count, c.tradesN), winrate: m.count ? formatPercent(m.wins / m.count, 0) : '—' })}
        </p>
        <dl className="mt-3 grid gap-2 border-t border-border pt-3 text-sm">
          <Row label={c.maxWin} value={m.best === null ? '—' : formatPnl(m.best)} up={m.best !== null} />
          <Row label={c.maxLoss} value={m.worst === null ? '—' : formatPnl(m.worst)} down={m.worst !== null} />
        </dl>
      </section>
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
      <aside ref={panelRef} data-shot="calendar-panel" className="flex flex-col gap-3">
        {side && <MonthTotalCard />}
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

            <section style={{ '--i': 3 } as CSSProperties} className="rise rounded-lg border border-border bg-surface p-4">
              <h2 className="text-xs text-muted">{c.byWeek}</h2>
              <div className="mt-2 grid gap-2.5">
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

            {/* график дней недели фиксированной высоты (176px) */}
            <section style={{ '--i': 4 } as CSSProperties} className="rise rounded-lg border border-border bg-surface p-4">
              <h2 className="text-xs text-muted">{c.byWeekday}</h2>
              {/* линия нуля посередине: прибыль вверх, убыток вниз, сумма над / под столбиком; дни без сделок — «—» */}
              <div data-shot="weekday-chart" className="relative mt-3 grid h-44 grid-cols-7 gap-1.5">
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

            <PairsCard data={pairs} fill={side} />
          </>
        )}
      </aside>
    )
  }
}

/**
 * «Пары месяца» + «Серия» (выбор владельца 16.11.2026 вместо растянутого графика): последняя карточка правой колонки.
 * fill (xl): карточка добирает высоту до низа календаря — у списка пар 3 строки всегда, а если колонке есть куда расти,
 * строк столько, сколько помещается (остальные — «ещё N пар»); серия прижата к низу. Образцы — 21st.dev rank-bars, streak-field-stats.
 */
const PAIR_ROW = 26 // строка 16px + промежуток 10px
const PAIR_MIN = 3
const PAIR_HEAD = 24 // заголовок 16px + отступ 8px

function PairsCard({ data, fill }: { data: MonthPairs; fill: boolean }) {
  const t = useT()
  const c = t.dashboard.calendar
  const f = t.dashboard.kpi.form
  const listRef = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState(4)
  useLayoutEffect(() => {
    const el = listRef.current
    if (!fill || !el) return setFit(4)
    const update = () => setFit(Math.floor((el.clientHeight + 10) / PAIR_ROW))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [fill])
  const all = data.pairs
  // не меньше 3 строк всегда (иначе карточка пустая), больше — если колонке есть куда расти
  const minRows = Math.min(all.length, PAIR_MIN)
  const rows = Math.max(minRows, fit)
  const shown = all.length > rows ? all.slice(0, rows - 1) : all
  const rest = all.slice(shown.length)
  const max = Math.max(1e-9, ...all.map((p) => Math.abs(p.pnl)))
  const restPnl = rest.reduce((a, p) => a + p.pnl, 0)
  const cur = data.current
  const word = (v: number) => (v > 0 ? f.win : v < 0 ? f.loss : f.even)
  return (
    <section data-shot="month-pairs" style={{ '--i': 5 } as CSSProperties} className="rise flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 xl:flex-1">
      {/* на xl блок пар влияет на высоту колонки только тремя строками (minHeight), остальное — из свободного места */}
      <div className="flex flex-col xl:flex-1 xl:basis-0 xl:overflow-hidden" style={fill ? { minHeight: PAIR_HEAD + minRows * PAIR_ROW - 10 } : undefined}>
        <h2 className="text-xs text-muted">{c.pairs}</h2>
        <div ref={listRef} data-pairs className="mt-2 flex flex-col gap-2.5 xl:min-h-0 xl:flex-1">
          {shown.map((p) => (
            <div key={p.symbol} title={`${p.symbol}: ${plural(p.count, c.tradesN)}`} className="grid h-4 shrink-0 grid-cols-[88px_minmax(0,1fr)_auto] items-center gap-2 text-xs">
              <CoinChip symbol={p.symbol} size="xs" />
              <Bar value={p.pnl} max={max} />
              <span className={`num w-20 text-right font-semibold ${p.pnl < 0 ? 'text-down' : ''}`}>{formatPnl(p.pnl)}</span>
            </div>
          ))}
          {rest.length > 0 && (
            <div className="grid h-4 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-xs text-muted">
              <span>{plural(rest.length, c.pairsMore)}</span>
              <span className="num w-20 text-right">{formatPnl(restPnl)}</span>
            </div>
          )}
        </div>
      </div>

      <div data-shot="month-streak" className="border-t border-border pt-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-xs text-muted">{plural(data.recent.length, f.title)}</h2>
          <span className="text-xs text-muted">{f.order}</span>
        </div>
        <ol className="mt-2 grid grid-cols-[repeat(10,minmax(0,1fr))] gap-1">
          {data.recent.map((v, i) => (
            <li
              key={i}
              title={`${word(v)}: ${formatPnl(v)}`}
              aria-label={`${word(v)}: ${formatPnl(v)}`}
              className={`num flex aspect-square items-center justify-center rounded-md text-xs font-bold ${
                v > 0 ? 'bg-up/15 text-up' : v < 0 ? 'bg-down/15 text-down' : 'border border-dashed border-border text-muted'
              }`}
            >
              {v > 0 ? f.winLetter : v < 0 ? f.lossLetter : f.evenLetter}
            </li>
          ))}
        </ol>
        {/* текущая серия слева, самые длинные серии месяца справа — одной строкой */}
        <div className="mt-2 flex items-baseline justify-between gap-2 text-xs">
          <span className={cur ? (cur.win ? 'text-up' : 'text-down') : 'text-muted'}>{cur ? plural(cur.n, cur.win ? f.streakWin : f.streakLoss) : ''}</span>
          <span data-streak-record title={`${c.longestWin}: ${data.bestWin} · ${c.longestLoss}: ${data.worstLoss}`} className="num shrink-0 text-muted">
            {c.record} <span className="font-semibold text-up">{data.bestWin} {f.winLetter}</span> · <span className="font-semibold text-down">{data.worstLoss} {f.lossLetter}</span>
          </span>
        </div>
      </div>
    </section>
  )
}

function Row({ label, sub, value, down = false, up = false }: { label: string; sub?: string; value: string; down?: boolean; up?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">
        {label}
        {sub && <span className="ml-1.5 text-xs text-muted/70">{sub}</span>}
      </dt>
      <dd className={`num font-semibold ${down ? 'text-down' : up ? 'text-up' : ''}`}>{value}</dd>
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
