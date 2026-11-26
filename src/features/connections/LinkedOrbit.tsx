/**
 * «Подключённые биржи» на странице «Биржи».
 *  - слева — «Мозг из сделок» (владелец 26.11.2026, components/fx/TradeBrain3D; до этого — «Спираль времени»): сделки за выбранный диапазон (неделя … всё время) —
 *    камни на нити времени; навёл — сделка, нажал — её страница; «Обновить» в углу сцены — все работающие подключения разом.
 *    Пока сцена грузится (отдельный файл сборки) и если WebGL нет — плоская «Орбита»;
 *  - справа — «Подключено: Bybit, OKX…», как приходят сделки, итог за 30 дней, список подключённых бирж (точка статуса; наведение — горят
 *    только сделки этой биржи и виден статус, нажатие — панель биржи) и «Подключить ещё».
 * Проблемы с ключом — строками под блоком (ConnectionsCard).
 */
import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { fmt, useT } from '@/i18n'
import { exchangeName } from '@/lib/exchanges'
import { formatDayShort, formatDuration, formatPnl, formatTimeIn } from '@/lib/format'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { radioKeys } from '@/lib/radioKeys'
import { browserTimeZone, zonedParts } from '@/lib/tz'
import { Button } from '@/components/ui/Button'
import { ExchangeLogo } from '@/components/ExchangeLogo'
import { AnimatedNumber } from '@/components/AnimatedNumber'
import { Orbit } from '@/components/fx/Orbit'
import type { BrainTrade } from '@/components/fx/TradeBrain3D'
import { useTrades } from '@/features/trades/api'
import { useProfile } from '@/features/settings/api'
import { coinIconUrl, useCoins } from '@/features/portfolio/api'
import { errorCodeOf, type Connection } from './api'

const TradeBrain3D = lazy(() => import('@/components/fx/TradeBrain3D').then((m) => ({ default: m.TradeBrain3D })))

/** сколько последних сделок на спирали (больше — мелко и тяжело); остальные — в итоге справа */
const MAX_NODES = 60

/** диапазон спирали (владелец 25.11.2026: «выбирать диапазон — неделя, месяц и т. д.»): дней назад от сейчас, 0 — всё время */
const RANGES = [7, 30, 90, 365, 0] as const
type RangeDays = (typeof RANGES)[number]

type Props = {
  conns: Connection[]
  pro: boolean
  onAdd: () => void
  /** нажали на биржу в списке — панель этой биржи */
  onOpen: (exchange: string) => void
  /** «Обновить» в сцене — все работающие подключения */
  onRefresh: () => void
  refreshing: boolean
}

/** BTCUSDT → BTC, ETH-USDT-SWAP → ETH, Polymarket — начало вопроса */
function shortLabel(symbol: string, title?: string | null): string {
  if (title) return title.length > 16 ? title.slice(0, 15) + '…' : title
  const s = symbol.toUpperCase().replace(/-SWAP$|[-_/]?PERP$/, '').replace(/[-_/:]?(USDT|USDC|USD|FDUSD|BUSD)$/, '')
  return s.replace(/[-_/:]$/, '') || symbol
}

/** 1000PEPE → PEPE, kPEPE → PEPE: множитель в тикере бирж — не часть монеты */
const baseCoin = (label: string) => label.replace(/^(1000000|100000|10000|1000|100|K)(?=[A-Z])/, '')

export function LinkedOrbit({ conns, pro, onAdd, onOpen, onRefresh, refreshing }: Props) {
  const t = useT()
  const c = t.connections
  const navigate = useNavigate()
  const huge = useMediaQuery('(min-width: 1536px)')
  const wide = useMediaQuery('(min-width: 1280px)')
  const mid = useMediaQuery('(min-width: 768px)')
  const [noGl, setNoGl] = useState(false)
  const [focus, setFocus] = useState<string | null>(null)
  // одна биржа двумя ключами — одна; в порядке подключения
  const ids = useMemo(() => [...new Set(conns.map((cn) => cn.exchange))], [conns])
  const lit = useMemo(() => new Set(ids), [ids])
  const names = ids.slice(0, 3).map((ex) => exchangeName(ex, ex)).join(', ') + (ids.length > 3 ? ` ${fmt(c.linked.more, { n: ids.length - 3 })}` : '')

  // сделки за выбранный диапазон (по закрытию), в поясе пользователя
  const { data: profile } = useProfile()
  const tz = profile?.timezone || browserTimeZone()
  const [days, setDays] = useState<RangeDays>(30)
  const range = useMemo(() => ({ from: days ? new Date(Date.now() - days * 86_400_000).toISOString() : null, to: null }), [days])
  const rangeName = (d: RangeDays) => (d === 7 ? c.planet.ranges.week : d === 30 ? c.planet.ranges.month : d === 90 ? c.planet.ranges.quarter : d === 365 ? c.planet.ranges.year : c.planet.ranges.all)
  const { data: trades } = useTrades(range)
  const today = zonedParts(new Date().toISOString(), tz).date
  const yesterday = zonedParts(new Date(Date.now() - 86_400_000).toISOString(), tz).date
  const dayLabel = useCallback((day: string) => (day === today ? c.planet.today : day === yesterday ? c.planet.yesterday : formatDayShort(day)), [today, yesterday, c])

  const closed = useMemo(
    () => (trades ?? []).filter((tr) => tr.exit_at && tr.pnl !== null).sort((a, b) => Date.parse(a.exit_at!) - Date.parse(b.exit_at!)),
    [trades],
  )
  const total = useMemo(() => closed.reduce((s, tr) => s + Number(tr.pnl), 0), [closed])
  const counts = useMemo(() => closed.reduce<Record<string, number>>((m, tr) => ((m[tr.exchange] = (m[tr.exchange] ?? 0) + 1), m), {}), [closed])
  // иконки монет — те же, что в «Портфеле» (coins, у тикера — монета с большей капитализацией: список уже по рангу)
  const { data: coins } = useCoins()
  const icons = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const cn of coins ?? []) if (!m.has(cn.symbol.toUpperCase())) m.set(cn.symbol.toUpperCase(), cn.icon ?? null)
    return m
  }, [coins])
  const spiral = useMemo<BrainTrade[]>(
    () =>
      closed.slice(-MAX_NODES).map((tr) => {
        const day = zonedParts(tr.exit_at!, tz).date
        const label = shortLabel(tr.symbol, tr.title)
        return {
          id: tr.id,
          exchange: tr.exchange,
          exName: exchangeName(tr.exchange, t.exchange.other),
          label,
          icon: tr.market_type === 'prediction' ? null : coinIconUrl(icons.get(baseCoin(label)) ?? null),
          symbol: tr.title || tr.symbol,
          side: tr.side === 'short' ? t.side.short : t.side.long,
          pnl: Number(tr.pnl),
          when: `${dayLabel(day)}, ${formatTimeIn(tr.exit_at!, tz)}`,
        }
      }),
    [closed, tz, t, dayLabel, icons],
  )

  // список подключённых бирж: точка статуса и строка «обновлено 12 мин назад» / «ключ не работает»
  const rows = useMemo(() => {
    const now = Date.now()
    return ids.map((ex) => {
      const mine = conns.filter((cn) => cn.exchange === ex)
      const error = mine.some((cn) => errorCodeOf(cn.last_error))
      const last = Math.max(0, ...mine.map((cn) => (cn.last_sync_at ? Date.parse(cn.last_sync_at) : 0)))
      const ago = last ? now - last : null
      const when = ago === null ? c.neverSynced : ago < 60_000 ? c.updatedNow : fmt(c.updatedAgo, { ago: formatDuration(ago) })
      const name = ex === 'evm' ? 'EVM' : ex === 'solana' ? 'Solana' : exchangeName(ex, ex)
      return { ex, name, error, status: error ? c.planet.error : `${c.status.ok} · ${when.charAt(0).toLowerCase()}${when.slice(1)}` }
    })
  }, [ids, conns, c])

  // высота сцены (ширина — ×1,3); на телефоне — по ширине экрана
  const phoneW = typeof window === 'undefined' ? 390 : window.innerWidth
  const size = huge ? 540 : wide ? 460 : mid ? 380 : Math.min(320, Math.floor((phoneW - 80) / 1.3))
  const flat = <Orbit size={wide ? 380 : mid ? 320 : 250} lit={lit} />
  const openTrade = useCallback((id: string) => navigate(`/trades/${id}`), [navigate])

  return (
    <div
      data-linked-orbit
      className="grid items-center justify-items-center gap-4 rounded-xl border border-border bg-surface px-4 py-4 sm:px-8 md:grid-cols-[auto_minmax(0,24rem)] md:justify-center md:justify-items-start md:gap-8 xl:gap-12 xl:py-6"
    >
      <div className="grid place-items-center" style={{ width: Math.round(size * 1.3), height: size, maxWidth: '100%' }}>
        {noGl || trades === undefined ? (
          flat
        ) : (
          <Suspense fallback={flat}>
            <TradeBrain3D
              trades={spiral}
              size={size}
              focus={focus}
              busy={refreshing}
              onOpenTrade={openTrade}
              onRefresh={onRefresh}
              labels={{ scene: fmt(c.planet.scene, { range: rangeName(days).toLowerCase() }), refresh: c.planet.refresh, empty: c.planet.empty, enter: c.planet.enter, exit: c.planet.exit }}
              onFail={() => setNoGl(true)}
            />
          </Suspense>
        )}
      </div>
      <div className="flex w-full max-w-xl flex-col gap-4 md:max-w-none">
        <div className="flex flex-col gap-2 text-center md:text-left">
          <p className="font-display text-xl font-semibold xl:text-2xl">{fmt(c.linked.title, { names })}</p>
          <p className="text-sm text-muted">{pro ? c.linked.textPro : c.linked.textFree}</p>
        </div>
        {/* итог за 30 дней — числа догоняют, когда приходят новые сделки */}
        {/* диапазон спирали и итога */}
        <div role="radiogroup" aria-label={c.planet.range} onKeyDown={radioKeys} data-brain-range className="flex flex-wrap justify-center gap-1.5 md:justify-start">
          {RANGES.map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={days === d}
              tabIndex={days === d ? 0 : -1}
              data-range={d}
              onClick={() => setDays(d)}
              className={`h-8 rounded-full border px-3 text-xs font-semibold transition-colors ${days === d ? 'border-primary bg-primary/12 text-text' : 'border-border text-muted hover:border-primary/60 hover:text-text'}`}
            >
              {rangeName(d)}
            </button>
          ))}
        </div>
        <div data-brain-stats className="flex justify-center gap-8 md:justify-start">
          <div>
            <p className="text-xs text-muted">{c.planet.trades}</p>
            <AnimatedNumber value={closed.length} format={(n) => String(Math.round(n))} className="num font-display text-2xl font-semibold xl:text-3xl" />
          </div>
          <div>
            <p className="text-xs text-muted">{c.planet.result}</p>
            <AnimatedNumber
              value={total}
              format={formatPnl}
              className={`num font-display text-2xl font-semibold xl:text-3xl ${total > 0 ? 'text-up' : total < 0 ? 'text-down' : ''}`}
            />
          </div>
        </div>
        {closed.length > MAX_NODES && (
          <p data-brain-trimmed className="-mt-2 text-center text-xs text-muted md:text-left">{fmt(c.planet.trimmed, { n: MAX_NODES, total: closed.length })}</p>
        )}
        <div className="border-t border-border pt-3">
          <p className="mb-1 text-xs text-muted">{c.planet.list}</p>
          <ul onPointerLeave={() => setFocus(null)}>
            {rows.map((r) => (
              <li key={r.ex}>
                <button
                  type="button"
                  data-brain-ex={r.ex}
                  data-status={r.error ? 'error' : 'ok'}
                  onPointerEnter={() => setFocus(r.ex)}
                  onFocus={() => setFocus(r.ex)}
                  onBlur={() => setFocus(null)}
                  onClick={() => onOpen(r.ex)}
                  className="group -mx-2 grid w-[calc(100%+1rem)] grid-cols-[1.5rem_auto_1fr] items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2 focus-visible:bg-surface-2"
                >
                  <span className="relative size-6">
                    <ExchangeLogo id={r.ex} className="size-6 rounded-md" />
                    <span aria-hidden className={`absolute -right-1 -top-1 size-2.5 rounded-full border-2 border-surface ${r.error ? 'bg-down' : 'bg-up'}`} />
                  </span>
                  <span className="text-sm font-semibold">{r.name}</span>
                  <span className="truncate text-right text-xs text-muted">
                    <span className="num group-hover:hidden group-focus-visible:hidden">{counts[r.ex] ?? '—'}</span>
                    <span className="hidden group-hover:inline group-focus-visible:inline">{r.status}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <ul data-planet-legend className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted md:justify-start">
          <li className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-up" aria-hidden />
            {c.planet.legendOk}
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-down" aria-hidden />
            {c.planet.legendError}
          </li>
        </ul>
        <p data-planet-hint className="text-center text-xs text-muted md:text-left">{mid ? c.planet.hint : c.planet.hintTouch}</p>
        <Button variant="secondary" className="self-center md:self-start" onClick={onAdd}>
          {c.linked.cta}
        </Button>
      </div>
    </div>
  )
}
