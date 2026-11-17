/**
 * «График сделки» на странице сделки (17.11.2026, план — п. 6 «Повтор сделки на графике» + «MAE / MFE»; функция Pro Plus).
 * Вид — как кривая капитала «Статистики» (владелец 17.11.2026: «вот пример нормальный»; первая версия со свечами и пунктирами — отклонена):
 * одна фиолетовая линия цены с заливкой, пунктир только по цене входа, бледная полоса времени сделки, точки входа и выхода (у выхода — PnL).
 * Цены — свечи с публичных API бирж (lib/candles.ts), без ключа. Над графиком — одна строка «Вход · Выход · Стоп · Тейк» и «Повтор» (линия рисуется заново).
 * Справа (на xl) / снизу — MFE, MAE и эффективность выхода (lib/calc/excursion.ts).
 */
import { useId, useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useQuery } from '@tanstack/react-query'
import { fmt, useT } from '@/i18n'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/Skeleton'
import { UpgradeLine } from '@/components/UpgradeLine'
import { useUsage } from '@/features/settings/api'
import { INTERVALS, INTERVAL_MS, autoInterval, loadTradeCandles, type Candle, type CandleSource, type Interval } from '@/lib/candles'
import { excursion, type Excursion } from '@/lib/calc/excursion'

const axisProps = { tick: { fill: 'var(--color-muted)', fontSize: 11 }, tickLine: false, axisLine: false } as const
import { fitAxis } from '@/lib/calc/axis'
import { displayTimeZone, formatPercent, formatPnl, formatPrice, formatR, formatUsd } from '@/lib/format'
import { intlLocale } from '@/lib/locale'
import { useMediaQuery } from '@/lib/useMediaQuery'
import type { Trade } from '@/types/db'

type ChartTrade = Pick<Trade, 'id' | 'exchange' | 'symbol' | 'market_type' | 'side' | 'entry_at' | 'exit_at' | 'entry_price' | 'exit_price' | 'stop_loss' | 'take_profit' | 'size_usd' | 'pnl'>
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
  const [drawKey, setDrawKey] = useState(0)
  // одна тихая строка вместо легенды: вход, выход, стоп, тейк
  const lineSummary = [
    `${c.entry} ${formatPrice(trade.entry_price)}`,
    trade.exit_price && exitMs !== null ? `${c.exit} ${formatPrice(trade.exit_price)}` : null,
    trade.stop_loss ? `${c.stopLoss} ${formatPrice(trade.stop_loss)}` : null,
    trade.take_profit ? `${c.takeProfit} ${formatPrice(trade.take_profit)}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

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
            <div className="flex items-center justify-between gap-3">
              <span className="num text-xs text-muted">{lineSummary}</span>
              <button type="button" onClick={() => setDrawKey((k) => k + 1)} data-replay className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted transition-colors hover:border-primary hover:text-text">
                <span aria-hidden>↻</span>
                {c.replay}
              </button>
            </div>
            <PriceChart key={`${iv}-${q.data.from}`} candles={q.data.candles} from={q.data.from} to={q.data.to} iv={iv} trade={trade} drawKey={drawKey} />
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

/**
 * Цена за время сделки — в стиле кривой капитала «Статистики» (выбор владельца 17.11.2026): одна фиолетовая линия с мягкой заливкой,
 * один пунктир — цена входа (как «0 $» у кривой капитала: выше — плюс для long), бледная полоса — время сделки,
 * точки входа и выхода с подписями. Без свечей, ценников и лишних пунктиров. «Повтор» — линия заново открывается слева направо (.eq-draw / .eq-curtain).
 */
function PriceChart({ candles, from, to, iv, trade, drawKey }: { candles: Candle[]; from: number; to: number; iv: Interval; trade: ChartTrade; drawKey: number }) {
  const c = useT().tradeForm.chart
  const id = useId().replace(/:/g, '')
  const wide = useMediaQuery('(min-width: 640px)')
  const ms = INTERVAL_MS[iv]
  const entryMs = Date.parse(trade.entry_at)
  const exitMs = trade.exit_at ? Date.parse(trade.exit_at) : null
  // точка линии — цена закрытия свечи в момент её закрытия
  const data = useMemo(() => candles.map((k) => ({ t: Math.min(to, k.t + ms), v: k.c })), [candles, ms, to])
  const exitPrice = exitMs !== null && trade.exit_price ? trade.exit_price : null
  const axis = useMemo(() => fitAxis([...data.map((d) => d.v), trade.entry_price, ...(exitPrice ? [exitPrice] : [])]), [data, trade.entry_price, exitPrice])
  const fmtTime = useMemo(() => {
    const opts: Intl.DateTimeFormatOptions =
      ms >= 86_400_000 ? { day: 'numeric', month: 'short' } : to - from > 86_400_000 ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { hour: '2-digit', minute: '2-digit' }
    return new Intl.DateTimeFormat(intlLocale(), { ...opts, timeZone: displayTimeZone() })
  }, [from, to, ms])
  const color = 'var(--color-primary)'
  const right = wide ? 104 : 16
  const pnl = trade.pnl
  const exitLabel = pnl !== null && pnl !== undefined ? formatPnl(pnl) : exitPrice !== null ? formatPrice(exitPrice) : ''
  return (
    <div key={drawKey} className="eq-draw relative h-[260px] sm:h-[320px]" data-price-chart>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 22, right, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor={color} stopOpacity={0.26} />
              <stop offset={1} stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="t" type="number" scale="time" domain={[from, to]} {...axisProps} tickFormatter={(v: number) => fmtTime.format(v)} minTickGap={48} />
          <YAxis {...axisProps} width={64} domain={[axis.lo, axis.hi]} ticks={axis.ticks} tickFormatter={(v: number) => formatPrice(v)} allowDataOverflow />
          {/* время сделки — бледная полоса */}
          <ReferenceArea x1={entryMs} x2={exitMs ?? to} fill={color} fillOpacity={0.05} stroke="none" ifOverflow="hidden" />
          {/* цена входа — единственный пунктир */}
          <ReferenceLine y={trade.entry_price} stroke="var(--color-muted)" strokeOpacity={0.45} strokeDasharray="4 4" />
          <Tooltip
            cursor={{ stroke: 'var(--color-muted)', strokeOpacity: 0.4 }}
            content={(props) => {
              const p = props as { active?: boolean; payload?: ReadonlyArray<{ payload?: { t: number; v: number } }> }
              const pt = p.active ? p.payload?.[0]?.payload : undefined
              if (!pt) return null
              const inTrade = pt.t >= entryMs && pt.t <= (exitMs ?? to)
              const move = trade.side === 'long' ? pt.v - trade.entry_price : trade.entry_price - pt.v
              return (
                <div className="num rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs shadow-lg">
                  <div className="text-muted">{fmtTime.format(pt.t)}</div>
                  <div className="mt-0.5 text-sm font-semibold">{formatPrice(pt.v)}</div>
                  {inTrade && <div className={`mt-0.5 ${move >= 0 ? 'text-profit' : 'text-loss'}`}>{`${move >= 0 ? '+' : '−'}${formatPercent(Math.abs(move) / trade.entry_price, 2)}`}</div>}
                </div>
              )
            }}
          />
          <Area type="monotone" dataKey="v" baseValue="dataMin" stroke={color} fill={`url(#${id}f)`} strokeWidth={2} dot={false} activeDot={{ r: 4.5, fill: color, stroke: 'var(--color-surface)', strokeWidth: 2 }} isAnimationActive={false} />
          <ReferenceDot
            x={entryMs}
            y={trade.entry_price}
            r={4.5}
            fill={color}
            stroke="var(--color-surface)"
            strokeWidth={2}
            ifOverflow="extendDomain"
            label={{ value: c.entry, position: 'top', offset: 10, fill: 'var(--color-muted)', fontSize: 12, fontFamily: 'var(--font-sans)' }}
          />
          {exitMs !== null && exitPrice !== null && (
            <ReferenceDot
              x={exitMs}
              y={exitPrice}
              r={4.5}
              fill={color}
              stroke="var(--color-surface)"
              strokeWidth={2}
              ifOverflow="extendDomain"
              label={{ value: exitLabel, position: 'top', offset: 10, fill: 'var(--color-text)', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-sans)' }}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
      {/* шторка: слева ось Y (64px), снизу ось X */}
      <div aria-hidden className="pointer-events-none absolute top-0 bottom-[30px] left-[64px] overflow-hidden" style={{ right }}>
        <div className="eq-curtain size-full bg-surface" />
      </div>
    </div>
  )
}
