/**
 * «Сделки собирают кривую» на странице «Биржи» (17.11.2026, вариант S3, вместо «Потока в дневник»):
 * слева — ТОЛЬКО подключённые биржи (до 5; «можно подключить» — не здесь, а в сетке бирж ниже), из логотипа биржи каждой сделки летят частицы и собирают
 * кривую из ВСЕХ сделок подключённых бирж за всё время (по API и файлом; владелец 17.11.2026); справа сверху — итог, набегает по мере сборки.
 * Строки бирж — кнопки: панель биржи с подключением (статус, ошибка, «Обновить», «Отключить»).
 * Собирается один раз при заходе на страницу и заново — когда синхронизация принесла новые сделки (если вкладку видно), иначе стоит.
 *
 * Все состояния (владелец 17.11.2026: «все варианты продуманы»):
 *  - у биржи статус как на её карточке: «синхронизация…» (мерцает), «ошибка» (красная точка), «на паузе» (серая, сверх тарифа), иначе «работает · сделок: N»;
 *  - кошельки EVM / Solana сделок не дают (только портфель) — в блоке их нет; одни кошельки — блока нет (ConnectionsCard);
 *  - одна сделка — уже кривая (от 0 до неё); ни одной — строка-подсказка;
 *  - одна биржа подключена двумя ключами — одна строка, сделки вместе.
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import { fmt, useT } from '@/i18n'
import { useTrades } from '@/features/trades/api'
import { exchangeName } from '@/lib/exchanges'
import { formatDateShort, formatPnl, pnlClass } from '@/lib/format'
import { buildCurve } from '@/lib/calc/curve'
import { ExchangeLogo } from '@/components/ExchangeLogo'
import { ParticleCurve } from '@/components/fx/ParticleCurve'
import { Shimmer } from '@/components/fx/Shimmer'
import { PORTFOLIO_ONLY, useSyncingIds, type Connection } from './api'
import { useMediaQuery } from '@/lib/useMediaQuery'

type State = 'syncing' | 'error' | 'paused' | 'ok'

export function ArrivalsCurve({ conns, active, onOpen }: { conns: Connection[]; active: Set<string>; onOpen: (exchange: string) => void }) {
  const t = useT()
  const c = t.connections.curve
  const syncing = useSyncingIds()
  // за всё время (владелец 17.11.2026) — тот же запрос, что у «Статистики» за «Всё время»
  const [range] = useState({ from: null, to: null })
  const tradeConns = useMemo(() => conns.filter((cn) => !PORTFOLIO_ONLY.has(cn.exchange)), [conns])
  const { data: trades } = useTrades(range, tradeConns.length > 0)
  const mine = useMemo(() => [...new Set(tradeConns.map((cn) => cn.exchange))], [tradeConns])
  // статус биржи — по её подключениям (их может быть несколько): идёт синхронизация → все на паузе → ошибка у всех работающих → работает
  const stateOf = (ex: string): State => {
    const list = tradeConns.filter((cn) => cn.exchange === ex)
    if (list.some((cn) => syncing.has(cn.id))) return 'syncing'
    const on = list.filter((cn) => active.has(cn.id))
    if (!on.length) return 'paused'
    if (on.every((cn) => cn.last_error)) return 'error'
    return 'ok'
  }
  // все закрытые сделки подключённых бирж (по API и файлом — двойники «файл + API» склеены в пользу файла), не больше 300 точек
  const curve = useMemo(() => buildCurve(trades ?? [], mine), [trades, mine])
  // кривая собирается заново только когда пришли НОВЫЕ сделки (другой набор), а не при каждом перезапросе тех же данных
  const sig = curve.values.join(',') + '|' + curve.from.join(',')
  const values = useMemo(() => curve.values, [sig])
  const fromRef = useRef<string[]>([])
  fromRef.current = curve.from
  const perExchange = curve.perExchange
  const count = curve.count
  // только подключённые биржи (владелец 17.11.2026: «Binance тут лишний» — подключить можно в сетке ниже); 4+ — плотнее, видно до 5, остальные — «+N»
  const many = mine.length >= 4
  const shown = mine.slice(0, 5)
  const logos = useRef(new Map<string, HTMLElement>())
  const source = useCallback((i: number) => logos.current.get(fromRef.current[i]) ?? logos.current.values().next().value ?? null, [])
  const [landed, setLanded] = useState(0)
  const wide = useMediaQuery('(min-width: 640px)')
  const sum = landed > 0 ? values[Math.min(landed, values.length) - 1] : 0
  return (
    <div data-arrivals-curve className="relative h-[240px] overflow-hidden rounded-xl border border-border bg-surface sm:h-[300px]">
      {count >= 1 && <ParticleCurve values={values} source={source} left={wide ? 210 : 40} onLanded={setLanded} className="absolute inset-0" />}
      <ul className={`absolute top-0 bottom-0 left-4 flex flex-col justify-center sm:left-5 ${many ? 'gap-2' : 'gap-3'}`}>
        {shown.map((ex) => {
          const st = stateOf(ex)
          const n = perExchange.get(ex)
          return (
            <li key={ex} data-curve-source={ex} data-state={st} className={st === 'paused' ? 'opacity-60' : ''}>
              {/* нажатие — панель биржи: статус, ошибка, «Обновить», «Отключить», подключить ещё */}
              <button
                type="button"
                onClick={() => onOpen(ex)}
                aria-label={fmt(c.open, { name: exchangeName(ex, '') })}
                className="-mx-2 flex items-center gap-2.5 rounded-lg px-2 py-1 text-left transition-colors hover:bg-surface-2/70 focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span
                  ref={(el) => {
                    if (el) logos.current.set(ex, el)
                    else logos.current.delete(ex)
                  }}
                >
                  <ExchangeLogo id={ex} className={`rounded-lg ${many ? 'size-8' : 'size-9'}`} />
                </span>
                <span className="hidden sm:block">
                  <span className="block text-sm font-semibold">{exchangeName(ex, '')}</span>
                  <span className="flex items-center gap-1.5 text-xs text-muted">
                    <i aria-hidden className={`size-1.5 rounded-full ${st === 'ok' ? 'bg-up' : st === 'error' ? 'bg-down' : st === 'syncing' ? 'bg-primary' : 'bg-muted'}`} />
                    {st === 'syncing' ? <Shimmer>{t.connections.status.syncing}</Shimmer> : st === 'ok' ? (n ? fmt(c.worksN, { n }) : c.works) : t.connections.status[st]}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
        {mine.length > shown.length && <li className="pl-1 text-xs text-muted">+{mine.length - shown.length}</li>}
      </ul>
      <div className="absolute top-4 right-5 left-20 text-right sm:left-auto">
        {count >= 1 ? (
          <>
            <div className={`num text-2xl font-semibold ${pnlClass(sum)}`} data-curve-sum>
              {formatPnl(sum)}
            </div>
            <div className="text-xs text-muted">{fmt(c.caption, { n: count, since: formatDateShort(curve.since!) })}</div>
          </>
        ) : (
          <div className="ml-auto max-w-[16rem] text-sm text-muted">{c.empty}</div>
        )}
      </div>
    </div>
  )
}
