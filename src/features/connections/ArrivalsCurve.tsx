/**
 * «Сделки собирают кривую» на странице «Биржи» (17.11.2026, вариант S3, вместо «Потока в дневник»):
 * слева — подключённые биржи (до 5; при 1–3 — ещё одна, которую можно подключить), из логотипа биржи каждой сделки летят частицы и собирают
 * кривую из сделок, пришедших по API за 7 дней; справа сверху — итог, набегает по мере сборки.
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
import { formatPnl, pnlClass } from '@/lib/format'
import { ExchangeLogo } from '@/components/ExchangeLogo'
import { ParticleCurve } from '@/components/fx/ParticleCurve'
import { Shimmer } from '@/components/fx/Shimmer'
import { EXCHANGE_CARDS } from './ExchangeGrid'
import { PORTFOLIO_ONLY, useSyncingIds, type Connection } from './api'
import { useMediaQuery } from '@/lib/useMediaQuery'

type State = 'syncing' | 'error' | 'paused' | 'ok'

export function ArrivalsCurve({ conns, active }: { conns: Connection[]; active: Set<string> }) {
  const t = useT()
  const c = t.connections.curve
  const syncing = useSyncingIds()
  // то же окно, что у столбиков на карточках (useRecentPnl): один запрос на двоих
  const [range] = useState(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - 7)
    return { from: d.toISOString(), to: null }
  })
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
  const series = useMemo(() => {
    const list = (trades ?? [])
      .filter((tr) => tr.source === 'api' && tr.exit_at && tr.pnl !== null && mine.includes(tr.exchange))
      .sort((a, z) => Date.parse(a.exit_at!) - Date.parse(z.exit_at!))
    let eq = 0
    // точка 0 — начало (0 $), точка i — после i-й сделки; у каждой точки — биржа, откуда пришла сделка
    return { values: [0, ...list.map((tr) => (eq += Number(tr.pnl)))], from: [list[0]?.exchange ?? '', ...list.map((tr) => tr.exchange)] }
  }, [trades, mine])
  // кривая собирается заново только когда пришли НОВЫЕ сделки (другой набор), а не при каждом перезапросе тех же данных
  const sig = series.values.join(',') + '|' + series.from.join(',')
  const values = useMemo(() => series.values, [sig])
  const fromRef = useRef<string[]>([])
  fromRef.current = series.from
  const perExchange = useMemo(() => {
    const m = new Map<string, number>()
    for (const ex of series.from.slice(1)) m.set(ex, (m.get(ex) ?? 0) + 1)
    return m
  }, [series])
  const count = values.length - 1
  // много подключений (4+) — без строки «можно подключить» и плотнее; видно до 5 бирж, остальные — «+N»
  const many = mine.length >= 4
  const shown = mine.slice(0, 5)
  const next = many ? undefined : EXCHANGE_CARDS.find((x) => x.methods.includes('api') && !mine.includes(x.id))
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
            <li key={ex} data-curve-source={ex} data-state={st} className={`flex items-center gap-2.5 ${st === 'paused' ? 'opacity-60' : ''}`}>
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
            </li>
          )
        })}
        {mine.length > shown.length && <li className="pl-1 text-xs text-muted">+{mine.length - shown.length}</li>}
        {next && (
          <li data-curve-next={next.id} className="flex items-center gap-2.5 opacity-60">
            <ExchangeLogo id={next.id} className="size-9 rounded-lg" />
            <span className="hidden sm:block">
              <span className="block text-sm font-semibold">{exchangeName(next.id, '')}</span>
              <span className="block text-xs text-muted">{c.canConnect}</span>
            </span>
          </li>
        )}
      </ul>
      <div className="absolute top-4 right-5 left-20 text-right sm:left-auto">
        {count >= 1 ? (
          <>
            <div className={`num text-2xl font-semibold ${pnlClass(sum)}`} data-curve-sum>
              {formatPnl(sum)}
            </div>
            <div className="text-xs text-muted">{fmt(c.caption, { n: count })}</div>
          </>
        ) : (
          <div className="ml-auto max-w-[16rem] text-sm text-muted">{c.empty}</div>
        )}
      </div>
    </div>
  )
}
