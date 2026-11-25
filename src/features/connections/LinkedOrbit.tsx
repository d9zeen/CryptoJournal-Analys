/**
 * «Подключённые биржи» на странице «Биржи».
 *  - слева — «Спираль времени» (владелец 25.11.2026 вместо планетария с глазом, components/fx/TimeSpiral3D): сделки последних 30 дней —
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
import { browserTimeZone, zonedParts } from '@/lib/tz'
import { Button } from '@/components/ui/Button'
import { ExchangeLogo } from '@/components/ExchangeLogo'
import { AnimatedNumber } from '@/components/AnimatedNumber'
import { Orbit } from '@/components/fx/Orbit'
import type { SpiralTrade } from '@/components/fx/TimeSpiral3D'
import { useTrades } from '@/features/trades/api'
import { useProfile } from '@/features/settings/api'
import { errorCodeOf, type Connection } from './api'

const TimeSpiral3D = lazy(() => import('@/components/fx/TimeSpiral3D').then((m) => ({ default: m.TimeSpiral3D })))

/** сколько последних сделок на спирали (больше — мелко и тяжело) */
const MAX_ON_SPIRAL = 44

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

  // сделки за 30 дней (по закрытию), в поясе пользователя
  const { data: profile } = useProfile()
  const tz = profile?.timezone || browserTimeZone()
  const [range] = useState(() => ({ from: new Date(Date.now() - 30 * 86_400_000).toISOString(), to: null }))
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
  const spiral = useMemo<SpiralTrade[]>(
    () =>
      closed.slice(-MAX_ON_SPIRAL).map((tr) => {
        const day = zonedParts(tr.exit_at!, tz).date
        return {
          id: tr.id,
          exchange: tr.exchange,
          exName: exchangeName(tr.exchange, t.exchange.other),
          label: shortLabel(tr.symbol, tr.title),
          symbol: tr.title || tr.symbol,
          side: tr.side === 'short' ? t.side.short : t.side.long,
          pnl: Number(tr.pnl),
          day,
          when: `${dayLabel(day)}, ${formatTimeIn(tr.exit_at!, tz)}`,
        }
      }),
    [closed, tz, t, dayLabel],
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
            <TimeSpiral3D
              trades={spiral}
              dayLabel={dayLabel}
              size={size}
              focus={focus}
              busy={refreshing}
              onOpenTrade={openTrade}
              onRefresh={onRefresh}
              labels={{ scene: c.planet.scene, refresh: c.planet.refresh, back: c.planet.back, empty: c.planet.empty }}
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
        <div data-spiral-stats className="flex justify-center gap-8 md:justify-start">
          <div>
            <p className="text-xs text-muted">{c.planet.trades30}</p>
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
        <div className="border-t border-border pt-3">
          <p className="mb-1 text-xs text-muted">{c.planet.list}</p>
          <ul onPointerLeave={() => setFocus(null)}>
            {rows.map((r) => (
              <li key={r.ex}>
                <button
                  type="button"
                  data-spiral-ex={r.ex}
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
