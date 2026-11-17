/**
 * «График сделки» на странице сделки (17.11.2026, план — п. 6 «Повтор сделки на графике» + «MAE / MFE»; функция Pro Plus).
 * Образец — 21st.dev market-chart (свечи на SVG, ценники справа, пунктир цены, таймфреймы пилюлями) и candlestick-chart.
 *
 * Свечи — публичные API бирж (lib/candles.ts), без ключа. На графике: полоса времени сделки, пунктиры входа / выхода / стопа / тейка
 * с ценниками справа, точки входа и выхода, отметки лучшей (MFE) и худшей (MAE) точки. Строка над графиком — O / H / L / C свечи под мышью.
 * «Повтор» — свечи появляются по одной от входа до выхода (только появление; «Уменьшить движение» — сразу весь график).
 * Справа (на xl) / снизу — MFE, MAE и эффективность выхода (lib/calc/excursion.ts).
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fmt, useT } from '@/i18n'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/Skeleton'
import { UpgradeLine } from '@/components/UpgradeLine'
import { useUsage } from '@/features/settings/api'
import { INTERVALS, INTERVAL_MS, autoInterval, loadTradeCandles, type Candle, type CandleSource, type Interval } from '@/lib/candles'
import { excursion, type Excursion } from '@/lib/calc/excursion'
import { niceStep } from '@/lib/calc/axis'
import { displayTimeZone, formatPercent, formatPrice, formatR, formatUsd } from '@/lib/format'
import { intlLocale } from '@/lib/locale'
import { prefersReducedMotion } from '@/lib/motion'
import { useMediaQuery } from '@/lib/useMediaQuery'
import type { Trade } from '@/types/db'

type ChartTrade = Pick<Trade, 'id' | 'exchange' | 'symbol' | 'market_type' | 'side' | 'entry_at' | 'exit_at' | 'entry_price' | 'exit_price' | 'stop_loss' | 'take_profit' | 'size_usd'>
type Choice = 'auto' | Interval
const CHOICES: Choice[] = ['auto', ...INTERVALS.filter((i) => i !== '1w')]
const SOURCE_NAMES: Record<CandleSource, string> = { bybit: 'Bybit', binance: 'Binance', okx: 'OKX', hyperliquid: 'Hyperliquid' }

export function TradeChart({ trade }: { trade: ChartTrade }) {
  const t = useT()
  const c = t.tradeForm.chart
  const { data: usage } = useUsage()
  const allowed = usage?.plan === 'pro_plus'
  const [choice, setChoice] = useState<Choice>('auto')
  const entryMs = Date.parse(trade.entry_at)
  const exitMs = trade.exit_at ? Date.parse(trade.exit_at) : null
  const iv: Interval = choice === 'auto' ? autoInterval(entryMs, exitMs ?? Date.now()) : choice

  const q = useQuery({
    queryKey: ['candles', trade.id, trade.exchange, trade.symbol, trade.market_type, trade.entry_at, trade.exit_at, iv],
    queryFn: () => loadTradeCandles(trade, iv),
    enabled: allowed && trade.market_type !== 'prediction',
    staleTime: exitMs === null ? 60_000 : Infinity,
    retry: false,
  })
  const ex = useMemo(() => (q.data ? excursion(q.data.candles, INTERVAL_MS[iv], trade) : null), [q.data, iv, trade])

  if (trade.market_type === 'prediction') return null
  return (
    <Card className="flex flex-col gap-4" data-trade-chart>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-medium">{c.title}</h2>
        {allowed && (
          <div role="radiogroup" aria-label={c.intervalLabel} className="flex overflow-x-auto rounded-full border border-border bg-surface-2 p-0.5">
            {CHOICES.map((o) => {
              const active = o === choice
              return (
                <button
                  key={o}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  data-interval={o}
                  onClick={() => setChoice(o)}
                  className={`num shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${active ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text'}`}
                >
                  {o === 'auto' ? `${c.auto}${choice === 'auto' ? ` · ${c.intervals[iv]}` : ''}` : c.intervals[o]}
                </button>
              )
            })}
          </div>
        )}
      </div>
      {!allowed ? (
        <UpgradeLine text={c.upgrade} />
      ) : q.isLoading ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
          <Skeleton className="h-[260px] sm:h-[320px]" />
          <Skeleton className="h-40 xl:h-[320px]" />
          <span className="sr-only">{c.loading}</span>
        </div>
      ) : !q.data ? (
        <p data-chart-none className="text-sm text-muted">
          {trade.exchange === 'hyperliquid' ? c.noneHl : c.none}
        </p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px] xl:items-start">
          <div className="flex min-w-0 flex-col gap-2">
            <CandleChart key={`${iv}-${q.data.from}`} candles={q.data.candles} from={q.data.from} to={q.data.to} iv={iv} trade={trade} ex={ex} />
            <p className="text-xs text-muted" data-chart-source={q.data.source}>
              {fmt(c.source, { exchange: SOURCE_NAMES[q.data.source], interval: c.intervals[iv] })}
            </p>
          </div>
          {ex && <ExcursionPanel ex={ex} open={exitMs === null} />}
        </div>
      )}
    </Card>
  )
}

function ExcursionPanel({ ex, open }: { ex: Excursion; open: boolean }) {
  const c = useT().tradeForm.chart
  const money = (usd: number | null, sign: 1 | -1) => (usd === null ? null : `${sign > 0 ? '+' : '−'}${formatUsd(usd)}`)
  const r = (v: number | null, sign: 1 | -1) => (v === null ? null : `${sign > 0 ? '+' : '−'}${formatR(v).replace(/^[+−-]/, '')}`)
  return (
    <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1" data-excursion>
      {open && <p className="text-xs text-muted sm:col-span-3 xl:col-span-1">{c.openNow}</p>}
      <Metric label={c.mfe} hint={c.mfeHint} tone="up" data="mfe" main={money(ex.mfeUsd, 1) ?? `+${formatPercent(ex.mfePct, 2)}`} sub={[`+${formatPercent(ex.mfePct, 2)}`, r(ex.mfeR, 1)]} />
      <Metric label={c.mae} hint={c.maeHint} tone="down" data="mae" main={money(ex.maeUsd, -1) ?? `−${formatPercent(ex.maePct, 2)}`} sub={[`−${formatPercent(ex.maePct, 2)}`, ex.maeR === null ? null : `${r(ex.maeR, -1)} · ${formatPercent(ex.maeR, 0)} ${c.ofStop}`]} />
      {!open && (
        <div className="rounded-lg border border-border bg-surface-2/60 p-3" data-efficiency title={c.efficiencyHint}>
          <div className="text-xs text-muted">{c.efficiency}</div>
          {ex.efficiency === null ? (
            <div className="mt-1 text-sm">{c.efficiencyNone}</div>
          ) : (
            <>
              <div className={`num mt-1 text-lg font-semibold ${ex.efficiency < 0 ? 'text-loss' : 'text-text'}`}>{formatPercent(ex.efficiency, 0)}</div>
              {/* шкала: сколько лучшего движения забрано */}
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
                <div className="h-full origin-left rounded-full bg-primary" style={{ transform: `scaleX(${Math.max(0, ex.efficiency)})` }} />
              </div>
            </>
          )}
          <p className="mt-2 text-xs text-muted">{c.efficiencyHint}</p>
        </div>
      )}
    </div>
  )
}

function Metric({ label, hint, main, sub, tone, data }: { label: string; hint: string; main: string; sub: (string | null)[]; tone: 'up' | 'down'; data: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/60 p-3" data-metric={data} title={hint}>
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <span aria-hidden className={`size-2 rounded-full ${tone === 'up' ? 'bg-up' : 'bg-down'}`} />
        {label}
      </div>
      <div className="num mt-1 text-lg font-semibold">{main}</div>
      <div className="num text-xs text-muted">{sub.filter(Boolean).join(' · ')}</div>
    </div>
  )
}

/** Ширина блока (ResizeObserver) */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

type Line = { key: string; price: number; label: string; color: string; dash: string }

function CandleChart({ candles, from, to, iv, trade, ex }: { candles: Candle[]; from: number; to: number; iv: Interval; trade: ChartTrade; ex: Excursion | null }) {
  const c = useT().tradeForm.chart
  const [box, width] = useWidth()
  const wide = useMediaQuery('(min-width: 640px)')
  const H = wide ? 320 : 260
  const M = { l: 6, r: wide ? 86 : 70, t: 10, b: 22 }
  const ms = INTERVAL_MS[iv]
  const slots = Math.max(1, Math.round((to - from) / ms))
  const plotW = Math.max(10, width - M.l - M.r)
  const plotH = H - M.t - M.b
  const step = plotW / slots
  const xAt = (time: number) => M.l + ((time - from) / ms) * step
  const entryMs = Date.parse(trade.entry_at)
  const exitMs = trade.exit_at ? Date.parse(trade.exit_at) : null

  // «Повтор»: сколько свечей видно (все — по умолчанию)
  const [shown, setShown] = useState(candles.length)
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      if (now - last >= 45) {
        last = now
        setShown((s) => {
          if (s >= candles.length) {
            setPlaying(false)
            return s
          }
          return s + 1
        })
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, candles.length])
  const replay = () => {
    if (playing) {
      setPlaying(false)
      setShown(candles.length)
      return
    }
    if (prefersReducedMotion()) return setShown(candles.length)
    // с последней свечи перед входом
    const start = candles.findIndex((k) => k.t + ms > entryMs)
    setShown(Math.max(1, start < 0 ? 1 : start))
    setPlaying(true)
  }
  const visible = candles.slice(0, shown)
  const lastShownT = visible.length ? visible[visible.length - 1].t + ms : from
  const done = shown >= candles.length

  // шкала цены: свечи + линии сделки, если они не слишком далеко (далёкий стоп не сжимает свечи в нитку)
  const lines: Line[] = [
    { key: 'entry', price: trade.entry_price, label: c.entry, color: 'var(--color-primary)', dash: '5 4' },
    ...(trade.exit_price && exitMs !== null ? [{ key: 'exit', price: trade.exit_price, label: c.exit, color: 'var(--color-text)', dash: '2 4' }] : []),
    ...(trade.stop_loss ? [{ key: 'stop', price: trade.stop_loss, label: c.stopLoss, color: 'var(--color-loss)', dash: '3 3' }] : []),
    ...(trade.take_profit ? [{ key: 'take', price: trade.take_profit, label: c.takeProfit, color: 'var(--color-profit)', dash: '3 3' }] : []),
  ]
  const lo0 = Math.min(...candles.map((k) => k.l))
  const hi0 = Math.max(...candles.map((k) => k.h))
  const span0 = hi0 - lo0 || hi0 * 0.01
  const near = lines.filter((l) => l.price > 0 && l.price >= lo0 - span0 * 0.6 && l.price <= hi0 + span0 * 0.6)
  let lo = Math.min(lo0, ...near.map((l) => l.price))
  let hi = Math.max(hi0, ...near.map((l) => l.price))
  const pad = (hi - lo) * 0.06 || hi * 0.005
  lo -= pad
  hi += pad
  const y = (p: number) => M.t + ((hi - p) / (hi - lo)) * plotH
  const tickStep = niceStep((hi - lo) / 5)
  const ticks: number[] = []
  for (let v = Math.ceil(lo / tickStep) * tickStep; v <= hi; v += tickStep) ticks.push(v)

  // ценники справа не налезают друг на друга
  const pills = near
    .filter((l) => l.key !== 'exit' || done || (exitMs !== null && lastShownT > exitMs))
    .map((l) => ({ ...l, py: y(l.price) }))
    .sort((a, b) => a.py - b.py)
  for (let i = 1; i < pills.length; i++) if (pills[i].py - pills[i - 1].py < 18) pills[i].py = pills[i - 1].py + 18

  // подписи времени снизу: ~5 штук
  const fmtTime = useMemo(() => {
    const multiDay = to - from > 86_400_000
    const opts: Intl.DateTimeFormatOptions =
      ms >= 86_400_000 ? { day: 'numeric', month: 'short' } : multiDay ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { hour: '2-digit', minute: '2-digit' }
    return new Intl.DateTimeFormat(intlLocale(), { ...opts, timeZone: displayTimeZone() })
  }, [from, to, ms])
  const fullTime = useMemo(() => new Intl.DateTimeFormat(intlLocale(), { dateStyle: 'medium', timeStyle: 'short', timeZone: displayTimeZone() }), [])
  const xTicks = useMemo(() => {
    const n = Math.max(2, Math.min(6, Math.floor(plotW / 110)))
    return Array.from({ length: n }, (_, i) => from + Math.round(((to - from) / ms) * ((i + 0.5) / n)) * ms)
  }, [from, to, ms, plotW])

  // строка O / H / L / C: свеча под мышью или последняя показанная
  const [hover, setHover] = useState<number | null>(null)
  const onMove = (e: RPointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const slot = Math.floor((e.clientX - rect.left - M.l) / step)
    const time = from + slot * ms
    const i = visible.findIndex((k) => k.t === time)
    setHover(i >= 0 ? i : null)
  }
  const cur = visible[hover ?? visible.length - 1]
  const body = Math.max(1, Math.min(14, step * 0.68))
  const bandEnd = exitMs !== null ? Math.min(exitMs, lastShownT) : lastShownT

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-h-5 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="num text-xs text-muted" data-ohlc>
          {cur && (
            <>
              <span className="text-text">{fullTime.format(cur.t)}</span>
              {' · '}
              {fmt(c.ohlc, { o: formatPrice(cur.o), h: formatPrice(cur.h), l: formatPrice(cur.l), c: formatPrice(cur.c) })}
            </>
          )}
        </span>
        <button type="button" onClick={replay} data-replay={playing ? 'playing' : 'idle'} className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted transition-colors hover:border-primary hover:text-text">
          <span aria-hidden>{playing ? '■' : '▶'}</span>
          {c.replay}
        </button>
      </div>
      <div ref={box} className="relative w-full" style={{ height: H }}>
        {width > 0 && (
          <svg width={width} height={H} className="block touch-pan-y select-none" onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={c.title}>
            {/* сетка и цены слева направо */}
            {ticks.map((v) => (
              <g key={v}>
                <line x1={M.l} x2={M.l + plotW} y1={y(v)} y2={y(v)} stroke="var(--color-border)" strokeDasharray="2 4" />
                <text x={M.l + plotW + 6} y={y(v) + 4} fontSize={11} fill="var(--color-muted)" className="num">
                  {formatPrice(v)}
                </text>
              </g>
            ))}
            {xTicks.map((tm) => (
              <text key={tm} x={xAt(tm + ms / 2)} y={H - 6} fontSize={11} textAnchor="middle" fill="var(--color-muted)">
                {fmtTime.format(tm)}
              </text>
            ))}
            {/* время сделки */}
            {bandEnd > entryMs && <rect data-trade-band x={xAt(entryMs)} y={M.t} width={Math.max(1, xAt(bandEnd) - xAt(entryMs))} height={plotH} fill="var(--color-primary)" opacity={0.08} />}
            {/* свечи */}
            {visible.map((k, i) => {
              const cx = xAt(k.t + ms / 2)
              const up = k.c >= k.o
              const color = up ? 'var(--color-up)' : 'var(--color-down)'
              const top = y(Math.max(k.o, k.c))
              const h = Math.max(1, y(Math.min(k.o, k.c)) - top)
              return (
                <g key={k.t} opacity={hover === null || hover === i ? 1 : 0.55} data-candle>
                  <line x1={cx} x2={cx} y1={y(k.h)} y2={y(k.l)} stroke={color} strokeWidth={1} />
                  <rect x={cx - body / 2} y={top} width={body} height={h} fill={color} rx={body > 4 ? 1 : 0} />
                </g>
              )
            })}
            {/* линии сделки */}
            {pills.map((l) => (
              <line key={l.key} x1={M.l} x2={M.l + plotW} y1={y(l.price)} y2={y(l.price)} stroke={l.color} strokeDasharray={l.dash} strokeWidth={1} opacity={0.85} />
            ))}
            {/* лучшая / худшая точка — после повтора */}
            {done && ex && (
              <>
                {ex.mfeAt !== null && <Mark x={xAt(ex.mfeAt + ms / 2)} y={y(ex.mfePrice)} color="var(--color-up)" up={trade.side === 'long'} data="mfe" />}
                {ex.maeAt !== null && <Mark x={xAt(ex.maeAt + ms / 2)} y={y(ex.maePrice)} color="var(--color-down)" up={trade.side !== 'long'} data="mae" />}
              </>
            )}
            {/* вход и выход */}
            <circle data-entry cx={xAt(entryMs)} cy={y(trade.entry_price)} r={5} fill="var(--color-primary)" stroke="var(--color-surface)" strokeWidth={2} />
            {exitMs !== null && trade.exit_price && lastShownT > exitMs && (
              <circle data-exit cx={xAt(exitMs)} cy={y(trade.exit_price)} r={5} fill="var(--color-text)" stroke="var(--color-surface)" strokeWidth={2} />
            )}
            {/* ценники справа */}
            {pills.map((l) => (
              <g key={`p-${l.key}`} data-pill={l.key}>
                <rect x={M.l + plotW + 2} y={l.py - 8} width={M.r - 4} height={16} rx={4} fill={l.color} />
                <text x={M.l + plotW + 6} y={l.py + 4} fontSize={11} fontWeight={600} fill="var(--color-surface)" className="num">
                  {formatPrice(l.price)}
                </text>
              </g>
            ))}
          </svg>
        )}
      </div>
      {/* подписи линий — вместо легенды */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {lines.map((l) => (
          <span key={l.key} className="flex items-center gap-1.5">
            <svg width="16" height="6" aria-hidden>
              <line x1="0" x2="16" y1="3" y2="3" stroke={l.color} strokeDasharray={l.dash} strokeWidth="2" />
            </svg>
            {l.label} <span className="num text-text">{formatPrice(l.price)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/** Отметка лучшей / худшей точки: треугольник у экстремума свечи */
function Mark({ x, y, color, up, data }: { x: number; y: number; color: string; up: boolean; data: string }) {
  const d = up ? `M ${x - 5} ${y - 9} L ${x + 5} ${y - 9} L ${x} ${y - 3} Z` : `M ${x - 5} ${y + 9} L ${x + 5} ${y + 9} L ${x} ${y + 3} Z`
  return <path data-mark={data} d={d} fill={color} />
}
