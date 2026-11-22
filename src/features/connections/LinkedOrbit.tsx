/**
 * «Подключённые биржи» на странице «Биржи».
 *  - слева — 3D-планетарий (владелец 22.11.2026: «более крутую анимацию… можно контактировать… 3D», Three.js, components/fx/Planetarium3D):
 *    навёл на биржу — подпись со статусом, нажал — её панель; нажал на кристалл в центре — «Обновить все»; крутится мышью и пальцем.
 *    Пока сцена грузится (отдельный файл сборки) и если WebGL нет — плоская «Орбита», как раньше;
 *  - справа — «Подключено: Bybit, OKX…», как приходят сделки (сервер каждые 3 ч на Pro Plus / пока сайт открыт) и «Подключить ещё».
 * Списка подключений справа нет (владелец 20.11.2026) — проблемы с ключом строками под блоком (ConnectionsCard).
 */
import { lazy, Suspense, useMemo, useState } from 'react'
import { fmt, useT } from '@/i18n'
import { exchangeName } from '@/lib/exchanges'
import { formatDuration } from '@/lib/format'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { Button } from '@/components/ui/Button'
import { Orbit, ORBIT_INNER, ORBIT_OUTER } from '@/components/fx/Orbit'
import type { PlanetSat } from '@/components/fx/Planetarium3D'
import { errorCodeOf, type Connection } from './api'

const Planetarium3D = lazy(() => import('@/components/fx/Planetarium3D').then((m) => ({ default: m.Planetarium3D })))

type Props = {
  conns: Connection[]
  pro: boolean
  onAdd: () => void
  /** нажали на биржу в планетарии — панель этой биржи */
  onOpen: (exchange: string) => void
  /** нажали на кристалл — «Обновить все» */
  onRefresh: () => void
  refreshing: boolean
}

export function LinkedOrbit({ conns, pro, onAdd, onOpen, onRefresh, refreshing }: Props) {
  const t = useT()
  const c = t.connections
  const huge = useMediaQuery('(min-width: 1536px)')
  const wide = useMediaQuery('(min-width: 1280px)')
  const mid = useMediaQuery('(min-width: 768px)')
  const [noGl, setNoGl] = useState(false)
  // одна биржа двумя ключами — одна; в порядке подключения
  const ids = useMemo(() => [...new Set(conns.map((cn) => cn.exchange))], [conns])
  const lit = useMemo(() => new Set(ids), [ids])
  const names = ids.slice(0, 3).map((ex) => exchangeName(ex, ex)).join(', ') + (ids.length > 3 ? ` ${fmt(c.linked.more, { n: ids.length - 3 })}` : '')

  // биржи на орбитах: подключённые — со статусом и временем обновления, остальные — «нажми, чтобы подключить»
  const sats = useMemo<PlanetSat[]>(() => {
    const now = Date.now()
    const status = (ex: string): Pick<PlanetSat, 'status' | 'error'> => {
      const mine = conns.filter((cn) => cn.exchange === ex)
      if (!mine.length) return { status: c.planet.notConnected }
      if (mine.some((cn) => errorCodeOf(cn.last_error))) return { status: c.planet.error, error: true }
      const last = Math.max(0, ...mine.map((cn) => (cn.last_sync_at ? Date.parse(cn.last_sync_at) : 0)))
      const ago = last ? now - last : null
      const when = ago === null ? c.neverSynced : ago < 60_000 ? c.updatedNow : fmt(c.updatedAgo, { ago: formatDuration(ago) })
      return { status: `${c.status.ok} · ${when.charAt(0).toLowerCase()}${when.slice(1)}` }
    }
    const wallets = ['evm', 'solana'].filter((w) => lit.has(w))
    return [
      ...ORBIT_OUTER.map((id) => ({ id, name: exchangeName(id, id), lit: lit.has(id), ...status(id) })),
      ...[...ORBIT_INNER, ...wallets].map((id) => ({ id, name: id === 'evm' ? 'EVM' : id === 'solana' ? 'Solana' : exchangeName(id, id), lit: lit.has(id), inner: true, ...status(id) })),
    ]
  }, [conns, lit, c])

  // высота сцены (ширина — ×1,3); на телефоне — по ширине экрана
  const phoneW = typeof window === 'undefined' ? 390 : window.innerWidth
  const size = huge ? 540 : wide ? 460 : mid ? 360 : Math.min(300, Math.floor((phoneW - 80) / 1.3))
  const flat = <Orbit size={wide ? 380 : mid ? 320 : 250} lit={lit} />

  return (
    <div
      data-linked-orbit
      className="grid items-center justify-items-center gap-4 rounded-xl border border-border bg-surface px-4 py-4 sm:px-8 md:grid-cols-[auto_minmax(0,32rem)] md:justify-center md:justify-items-start md:gap-8 xl:gap-14 xl:py-6"
    >
      <div className="grid place-items-center" style={{ width: Math.round(size * 1.3), height: size, maxWidth: '100%' }}>
        {noGl ? (
          flat
        ) : (
          <Suspense fallback={flat}>
            <Planetarium3D
              sats={sats}
              size={size}
              onOpen={onOpen}
              onCenter={onRefresh}
              busy={refreshing}
              labels={{ center: c.planet.center, scene: c.planet.scene }}
              onFail={() => setNoGl(true)}
            />
          </Suspense>
        )}
      </div>
      <div className="flex max-w-xl flex-col items-center gap-3 text-center md:items-start md:text-left">
        <p className="font-display text-xl font-semibold xl:text-2xl">{fmt(c.linked.title, { names })}</p>
        <p className="text-sm text-muted xl:text-base">{pro ? c.linked.textPro : c.linked.textFree}</p>
        {/* что значат точки на плитках (владелец 22.11.2026: «почему красный, что подсвечивается?») */}
        <ul data-planet-legend className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted md:justify-start">
          <li className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-up" aria-hidden />
            {c.planet.legendOk}
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-down" aria-hidden />
            {c.planet.legendError}
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-2 rounded-full border border-muted" aria-hidden />
            {c.planet.legendOff}
          </li>
        </ul>
        <p data-planet-hint className="text-xs text-muted">{mid ? c.planet.hint : c.planet.hintTouch}</p>
        <Button variant="secondary" className="mt-1" onClick={onAdd}>
          {c.linked.cta}
        </Button>
      </div>
    </div>
  )
}
