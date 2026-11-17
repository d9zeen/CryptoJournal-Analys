/**
 * «Сделки собирают кривую» на странице «Биржи» (17.11.2026, вариант S3, вместо «Потока в дневник»):
 * слева — подключённые биржи (до 5; при 1–3 — ещё одна, которую можно подключить), из логотипа биржи каждой сделки летят частицы и собирают
 * кривую из сделок, пришедших по API за 7 дней; справа сверху — итог, набегает по мере сборки. Мало сделок — тихая строка.
 * Собирается один раз при заходе на страницу и заново — когда синхронизация принесла новые сделки (если вкладку видно), иначе стоит.
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import { fmt, useT } from '@/i18n'
import { useTrades } from '@/features/trades/api'
import { exchangeName } from '@/lib/exchanges'
import { formatPnl, pnlClass } from '@/lib/format'
import { ExchangeLogo } from '@/components/ExchangeLogo'
import { ParticleCurve } from '@/components/fx/ParticleCurve'
import { EXCHANGE_CARDS } from './ExchangeGrid'
import { useMediaQuery } from '@/lib/useMediaQuery'

export function ArrivalsCurve({ conns }: { conns: { exchange: string }[] }) {
  const t = useT()
  const c = t.connections.curve
  // то же окно, что у столбиков на карточках (useRecentPnl): один запрос на двоих
  const [range] = useState(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - 7)
    return { from: d.toISOString(), to: null }
  })
  const { data: trades } = useTrades(range, conns.length > 0)
  const mine = useMemo(() => [...new Set(conns.map((cn) => cn.exchange))], [conns])
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
      {count >= 2 && <ParticleCurve values={values} source={source} left={wide ? 210 : 40} onLanded={setLanded} className="absolute inset-0" />}
      <ul className={`absolute top-0 bottom-0 left-4 flex flex-col justify-center sm:left-5 ${many ? 'gap-2' : 'gap-3'}`}>
        {shown.map((ex) => (
          <li key={ex} data-curve-source={ex} className="flex items-center gap-2.5">
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
                <i aria-hidden className="size-1.5 rounded-full bg-up" />
                {perExchange.get(ex) ? fmt(c.worksN, { n: perExchange.get(ex)! }) : c.works}
              </span>
            </span>
          </li>
        ))}
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
      <div className="absolute top-4 right-5 text-right">
        {count >= 2 ? (
          <>
            <div className={`num text-2xl font-semibold ${pnlClass(sum)}`} data-curve-sum>
              {formatPnl(sum)}
            </div>
            <div className="text-xs text-muted">{fmt(c.caption, { n: count })}</div>
          </>
        ) : (
          <div className="max-w-[16rem] text-sm text-muted">{c.empty}</div>
        )}
      </div>
    </div>
  )
}
