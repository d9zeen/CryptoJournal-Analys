/**
 * «Подключённые биржи» на странице «Биржи» (владелец 19.11.2026: «1 убрать и поменять на 2» — вместо «Сделки собирают кривую»
 * тот же блок, что без подключений, — «Орбита» в три колонки):
 *  - слева «Орбита»: подключённые биржи и кошельки ярко, с рамкой цвета кнопок, остальные приглушены;
 *  - в середине — «Подключено: Bybit, OKX…», как приходят сделки (сервер каждые 3 ч на Pro Plus / пока сайт открыт) и «Подключить ещё»;
 *  - справа — вместо шагов «как подключить» строки подключений: логотип, статус (работает · сделок за всё время / синхронизация /
 *    ошибка / на паузе сверх тарифа), нажатие — панель биржи (статус, «Обновить», «Отключить»).
 * Сделки — за всё время, по API и файлом (двойники «файл + API» склеены — lib/calc/curve.ts buildCurve). Одна биржа двумя ключами — одна строка.
 */
import { useMemo, useState, type CSSProperties } from 'react'
import { fmt, useT } from '@/i18n'
import { useTrades } from '@/features/trades/api'
import { exchangeName } from '@/lib/exchanges'
import { buildCurve } from '@/lib/calc/curve'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { Button } from '@/components/ui/Button'
import { ExchangeLogo } from '@/components/ExchangeLogo'
import { Orbit } from '@/components/fx/Orbit'
import { Shimmer } from '@/components/fx/Shimmer'
import { shortKey } from '@/lib/sync/run'
import { PORTFOLIO_ONLY, useSyncingIds, type Connection } from './api'

type State = 'syncing' | 'error' | 'paused' | 'ok'

export function LinkedOrbit({
  conns,
  active,
  pro,
  onOpen,
  onAdd,
}: {
  conns: Connection[]
  active: Set<string>
  pro: boolean
  onOpen: (exchange: string) => void
  onAdd: () => void
}) {
  const t = useT()
  const c = t.connections
  const syncing = useSyncingIds()
  const wide = useMediaQuery('(min-width: 1280px)')
  const mid = useMediaQuery('(min-width: 768px)')
  // по одной строке на биржу / кошелёк (одна биржа двумя ключами — одна строка), в порядке подключения
  const ids = useMemo(() => [...new Set(conns.map((cn) => cn.exchange))], [conns])
  const tradeIds = useMemo(() => ids.filter((ex) => !PORTFOLIO_ONLY.has(ex)), [ids])
  const [range] = useState({ from: null, to: null })
  const { data: trades } = useTrades(range, tradeIds.length > 0)
  const counts = useMemo(() => buildCurve(trades ?? [], tradeIds).perExchange, [trades, tradeIds])
  const lit = useMemo(() => new Set(ids), [ids])

  // статус — по подключениям этой биржи: идёт синхронизация → все на паузе → ошибка у всех работающих → работает
  const stateOf = (ex: string): State => {
    const list = conns.filter((cn) => cn.exchange === ex)
    if (list.some((cn) => syncing.has(cn.id))) return 'syncing'
    const on = list.filter((cn) => active.has(cn.id))
    if (!on.length) return 'paused'
    if (on.every((cn) => cn.last_error)) return 'error'
    return 'ok'
  }
  const names = ids.slice(0, 3).map((ex) => exchangeName(ex, ex)).join(', ') + (ids.length > 3 ? ` ${fmt(c.linked.more, { n: ids.length - 3 })}` : '')

  return (
    <div
      data-linked-orbit
      className="grid items-center justify-items-center gap-6 rounded-xl border border-border bg-surface px-4 py-6 sm:px-8 md:grid-cols-[auto_minmax(0,1fr)] md:justify-items-start xl:grid-cols-[auto_minmax(0,30rem)_minmax(0,1fr)] xl:gap-12 xl:py-8"
    >
      <Orbit size={wide ? 340 : mid ? 280 : 220} lit={lit} />
      <div className="flex max-w-md flex-col items-center gap-3 text-center md:items-start md:text-left">
        <p className="font-display text-xl font-semibold xl:text-2xl">{fmt(c.linked.title, { names })}</p>
        <p className="text-sm text-muted xl:text-base">{pro ? c.linked.textPro : c.linked.textFree}</p>
        <Button variant="secondary" className="mt-1" onClick={onAdd}>
          {c.linked.cta}
        </Button>
      </div>
      <ul aria-label={c.linked.list} className="grid w-full gap-3 md:col-span-2 md:grid-cols-2 xl:col-span-1 xl:grid-cols-1">
        {ids.map((ex, i) => {
          const st = stateOf(ex)
          const wallet = PORTFOLIO_ONLY.has(ex)
          const n = counts.get(ex)
          const addr = conns.find((cn) => cn.exchange === ex)?.api_key ?? ''
          return (
            <li key={ex} data-linked={ex} data-state={st} className="rise" style={{ '--i': i + 2 } as CSSProperties}>
              <button
                type="button"
                onClick={() => onOpen(ex)}
                aria-label={fmt(c.curve.open, { name: exchangeName(ex, ex) })}
                className={`flex w-full items-center gap-3 rounded-lg border border-border bg-surface-2/50 p-3 text-left transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-primary ${st === 'paused' ? 'opacity-60' : ''}`}
              >
                <ExchangeLogo id={ex} className="size-9 shrink-0 rounded-lg" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{exchangeName(ex, ex)}</span>
                  <span className="flex items-center gap-1.5 text-xs text-muted">
                    <i aria-hidden className={`size-1.5 shrink-0 rounded-full ${st === 'ok' ? 'bg-up' : st === 'error' ? 'bg-down' : st === 'syncing' ? 'bg-primary' : 'bg-muted'}`} />
                    <span className="truncate">
                      {st === 'syncing' ? (
                        <Shimmer>{c.status.syncing}</Shimmer>
                      ) : st !== 'ok' ? (
                        c.status[st]
                      ) : wallet ? (
                        fmt(c.linked.wallet, { addr: shortKey(addr) })
                      ) : n ? (
                        fmt(c.curve.worksN, { n })
                      ) : (
                        c.curve.works
                      )}
                    </span>
                  </span>
                </span>
                <span aria-hidden className="shrink-0 text-xs text-muted">
                  {c.issueOpen} →
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
