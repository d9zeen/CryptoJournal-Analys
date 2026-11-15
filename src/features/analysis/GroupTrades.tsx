/**
 * «Разбор» → лента сделок на всю ширину над таблицей: карточки со скриншотом графика, пара, PnL, Long / Short, дата.
 * Листается слева направо (свайп, тачпад, Shift + колесо, кнопки ‹ ›), карточки встают по краю (scroll-snap).
 * Карточка — ссылка на сделку. Выбрана строка таблицы — только её сделки, иначе все сделки периода.
 * Образцы (правило 8): 21st.dev/@prebuiltui/components/image-gallery, 21st.dev/@ruixen.ui/components/card-stack.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { fmt, useT } from '@/i18n'
import { Card } from '@/components/ui/Card'
import { SideBadge } from '@/components/SideBadge'
import { formatDateShort, formatPnl, pnlClass } from '@/lib/format'
import { screenshotUrls } from '@/features/trades/screenshot'
import type { TradeWithTags } from '@/types/db'

type Props = {
  /** заголовок: название выбранной строки или null — «Все сделки периода» */
  name: string | null
  trades: TradeWithTags[]
  onReset: () => void
  /** подсказка «нажми на строку» — только когда под лентой есть таблица */
  canPick?: boolean
}

/** первый скриншот сделки (по порядку) */
const firstShot = (tr: TradeWithTags) => [...(tr.trade_screenshots ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0]?.path ?? null

export function GroupTrades({ name, trades, onReset, canPick = true }: Props) {
  const t = useT()
  const a = t.analysis.trades
  const [order, setOrder] = useState<'new' | 'loss'>('new')
  const strip = useRef<HTMLUListElement>(null)
  const [edge, setEdge] = useState({ start: true, end: true })

  const sorted = useMemo(
    () =>
      [...trades].sort((x, y) =>
        order === 'loss' ? Number(x.pnl ?? 0) - Number(y.pnl ?? 0) : y.entry_at > x.entry_at ? 1 : y.entry_at < x.entry_at ? -1 : 0,
      ),
    [trades, order],
  )
  const paths = sorted.map(firstShot).filter((p): p is string => p !== null)

  // временные ссылки на картинки — одним запросом на всю ленту (картинки грузятся по мере прокрутки: loading="lazy")
  const { data: urls } = useQuery({
    queryKey: ['screenshotUrls', paths],
    enabled: paths.length > 0,
    staleTime: 50 * 60_000,
    queryFn: () => screenshotUrls(paths),
  })

  // кнопки ‹ › гаснут у краёв ленты
  useEffect(() => {
    const el = strip.current
    if (!el) return
    const update = () => setEdge({ start: el.scrollLeft <= 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 })
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [sorted.length])
  // на начало ленты при смене порядка
  // фигурные скобки обязательны: в новых браузерах scrollTo возвращает Promise, а React принял бы его за функцию очистки
  useEffect(() => {
    strip.current?.scrollTo({ left: 0 })
  }, [order])

  const page = (dir: 1 | -1) => {
    const el = strip.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: 'smooth' })
  }
  const arrow = 'place-items-center size-8 rounded-lg border border-border bg-surface text-muted transition-colors hover:text-text disabled:opacity-40 disabled:hover:text-muted'

  return (
    <Card data-shot="group-trades" className="flex min-w-0 flex-col gap-3 !p-4 sm:!p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate font-semibold">{name ? fmt(a.of, { name, trades: fmt(t.dashboard.tooltipTrades, { n: trades.length }) }) : a.all}</h2>
          <p className="text-xs text-muted">
            {name ? (
              <button type="button" onClick={onReset} className="text-primary hover:underline">
                {a.reset}
              </button>
            ) : canPick ? (
              a.pickHint
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div role="group" aria-label={a.label} className="inline-flex rounded-lg border border-border bg-surface p-0.5 text-xs">
            {(['new', 'loss'] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={order === k}
                onClick={() => setOrder(k)}
                className={`rounded-md px-2.5 py-1 transition-colors ${order === k ? 'bg-surface-2 text-text' : 'text-muted hover:text-text'}`}
              >
                {k === 'new' ? a.sortNew : a.sortLoss}
              </button>
            ))}
          </div>
          <button type="button" aria-label={a.prev} disabled={edge.start} onClick={() => page(-1)} className={`${arrow} hidden sm:grid`}>
            ‹
          </button>
          <button type="button" aria-label={a.next} disabled={edge.end} onClick={() => page(1)} className={`${arrow} hidden sm:grid`}>
            ›
          </button>
        </div>
      </div>

      {/* лента: листается вбок, карточки встают по левому краю */}
      <ul
        ref={strip}
        data-strip
        aria-label={a.label}
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto overflow-y-hidden px-4 pb-2 sm:-mx-5 sm:scroll-px-5 sm:px-5"
      >
        {sorted.map((tr) => {
          const path = firstShot(tr)
          const url = path ? urls?.get(path) : undefined
          const count = tr.trade_screenshots?.length ?? 0
          const pnl = tr.pnl === null ? null : Number(tr.pnl)
          return (
            <li key={tr.id} className="w-[78%] shrink-0 snap-start sm:w-[320px] xl:w-[360px]">
              <Link
                to={`/trades/${tr.id}`}
                data-trade-card
                className="group flex h-full flex-col gap-1.5 rounded-xl border border-border bg-surface-2/40 p-1.5 transition-colors hover:border-primary/60 focus-visible:outline-2 focus-visible:outline-primary"
              >
                <div className="relative aspect-[16/10] overflow-hidden rounded-lg bg-surface-2">
                  {url ? (
                    <img src={url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs text-muted">
                      <svg viewBox="0 0 24 24" className="size-5 opacity-60" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
                        <path d="M3 17l5-6 4 4 3-3 6 5M4 5h16v14H4z" strokeLinejoin="round" />
                      </svg>
                      {path ? '' : a.noShot}
                    </div>
                  )}
                  {count > 1 && <span className="absolute right-1.5 bottom-1.5 rounded-md bg-bg/80 px-1.5 py-0.5 text-xs">{fmt(a.shots, { n: count })}</span>}
                </div>
                {/* строка 1: пара и PnL; строка 2: Long / Short и дата */}
                <div className="flex items-baseline justify-between gap-1.5 px-1 text-sm">
                  <span className="min-w-0 truncate font-medium" title={tr.title ?? tr.symbol}>
                    {tr.title ?? tr.symbol}
                  </span>
                  <span className={`num shrink-0 font-semibold ${pnlClass(pnl)}`}>{formatPnl(pnl)}</span>
                </div>
                <div className="flex items-center justify-between gap-1.5 px-1 pb-0.5 text-xs text-muted">
                  <SideBadge side={tr.side} />
                  <span>{formatDateShort(tr.entry_at)}</span>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
