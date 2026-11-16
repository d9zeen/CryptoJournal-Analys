/**
 * «Сначала биржа, потом способ» (страница «Биржи»): сетка карточек бирж — у каждой способы (API / Адрес / Файл) и статус,
 * если она уже подключена. Клик → ExchangePanel: панель справа (на телефоне — лист снизу) именно для этой биржи,
 * сверху переключатель «По API / Файлом». Образцы — 21st.dev integrations-4 (сетка) и settings / sheet (панель).
 */
import { useEffect, useRef, useState } from 'react'
import { useT } from '@/i18n'
import { Button } from '@/components/ui/Button'
import { exchangeName } from '@/lib/exchanges'
import { CONNECTABLE, errorCodeOf, type ConnectableId, type Connection } from './api'
import { AddForm } from './ConnectionsCard'

type Method = 'api' | 'wallet' | 'file'

/** Биржи на странице и как их можно подключить (названия — имена собственные) */
export const EXCHANGE_CARDS: { id: string; methods: Method[]; soon?: boolean; name?: string }[] = [
  { id: 'bybit', methods: ['api', 'file'] },
  { id: 'binance', methods: ['api', 'file'] },
  { id: 'okx', methods: ['api', 'file'] },
  { id: 'bingx', methods: ['api', 'file'] },
  { id: 'bitget', methods: ['api', 'file'] },
  { id: 'hyperliquid', methods: ['wallet', 'file'] },
  { id: 'polymarket', methods: ['wallet'] },
  { id: 'mexc', methods: ['file'] },
  { id: 'lighter', methods: [], soon: true, name: 'Lighter' },
  { id: 'other', methods: ['file'] },
]

const isConnectable = (id: string): id is ConnectableId => CONNECTABLE.some((x) => x.id === id)

export function ExchangeGrid({ conns, onOpen }: { conns: Connection[]; onOpen: (id: string) => void }) {
  const t = useT()
  const g = t.connections.grid
  return (
    <ul data-exchanges aria-label={g.title} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {EXCHANGE_CARDS.map((ex, i) => {
        const name = ex.name ?? (ex.id === 'other' ? g.other : exchangeName(ex.id, ''))
        const mine = conns.filter((cn) => cn.exchange === ex.id)
        const broken = mine.some((cn) => errorCodeOf(cn.last_error))
        const chips = ex.soon ? [g.soon] : ex.methods.map((m) => g.methods[m])
        const body = (
          <>
            <span className="flex items-start justify-between gap-2">
              <span className="truncate font-semibold">{name}</span>
              {mine.length > 0 && <span className={`mt-1.5 size-2 shrink-0 rounded-full ${broken ? 'bg-down' : 'bg-up'}`} aria-hidden />}
            </span>
            <span className="flex flex-wrap gap-1">
              {chips.map((chip) => (
                <span key={chip} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
                  {chip}
                </span>
              ))}
            </span>
            <span className={`mt-auto text-xs ${mine.length ? (broken ? 'text-loss' : 'text-up') : 'text-muted'}`}>
              {ex.soon ? g.soonHint : mine.length ? (broken ? g.broken : g.connected) : ex.methods[0] === 'file' ? `${g.upload} →` : `${g.connect} →`}
            </span>
          </>
        )
        const cls = 'rise flex h-full min-h-28 w-full flex-col gap-2 rounded-xl border border-border bg-surface p-3 text-left'
        return (
          <li key={ex.id} style={{ '--i': i } as React.CSSProperties}>
            {ex.soon ? (
              // «скоро» — без кнопки: нажимать нечего
              <div data-soon={name} className={`${cls} opacity-60`}>
                {body}
              </div>
            ) : (
              <button
                type="button"
                data-exchange={ex.id}
                onClick={() => onOpen(ex.id)}
                className={`${cls} card-lift transition-colors hover:border-primary/60 focus-visible:border-primary`}
              >
                {body}
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Панель биржи. exchange = null — общий «+ Подключить» (выбор биржи внутри формы).
 * Вкладка «Файлом»: где взять файл на этой бирже и «Выбрать файл» (дальше — предпросмотр на странице).
 */
export function ExchangePanel({
  exchange,
  count,
  admin,
  onClose,
  onPickFile,
}: {
  exchange: string | null
  count: number
  admin: boolean
  onClose: () => void
  onPickFile?: (exchange: string) => void
}) {
  const t = useT()
  const c = t.connections
  const g = c.grid
  const ref = useRef<HTMLDialogElement>(null)
  const card = EXCHANGE_CARDS.find((x) => x.id === exchange)
  const methods: Method[] = exchange === null ? ['api'] : (card?.methods ?? [])
  const [tab, setTab] = useState<Method>(methods[0] ?? 'file')
  useEffect(() => {
    const el = ref.current
    if (el && !el.open) el.showModal()
  }, [])
  const title = exchange === null ? g.pickTitle : exchange === 'other' ? g.other : exchangeName(exchange, '')
  const howTo = t.import.howTo as Record<string, string>

  return (
    <dialog
      ref={ref}
      data-panel={exchange ?? 'picker'}
      aria-labelledby="exchange-panel-title"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="day-sheet mx-0 mt-auto mb-0 max-h-[88dvh] w-full max-w-none rounded-t-2xl border border-border bg-surface p-0 text-text shadow-2xl backdrop:bg-bg/60 md:my-0 md:mr-0 md:ml-auto md:h-dvh md:max-h-none md:w-[460px] md:rounded-none md:rounded-l-2xl"
    >
      <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 id="exchange-panel-title" className="text-lg font-semibold">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label={c.bridge.close} className="grid size-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-text">
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* переключатель способов — только если их больше одного */}
        {methods.length > 1 && (
          <div role="tablist" aria-label={g.methodsLabel} className="grid grid-flow-col gap-1 rounded-lg bg-surface-2 p-1">
            {methods.map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={tab === m}
                onClick={() => setTab(m)}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${tab === m ? 'bg-surface font-medium text-text shadow-sm' : 'text-muted hover:text-text'}`}
              >
                {g.tabs[m]}
              </button>
            ))}
          </div>
        )}

        {tab === 'file' ? (
          <div data-panel-file className="flex flex-col gap-3">
            <p className="text-sm leading-relaxed">{howTo[exchange ?? 'other'] ?? howTo.other}</p>
            <Button
              onClick={() => {
                ref.current?.close()
                onPickFile?.(exchange === 'other' || exchange === null ? '' : exchange)
              }}
            >
              {g.pickFile}
            </Button>
            <p className="text-xs text-muted">{g.fileHint}</p>
          </div>
        ) : (
          <AddForm count={count} admin={admin} initial={exchange !== null && isConnectable(exchange) ? exchange : undefined} onClose={() => ref.current?.close()} />
        )}
      </div>
    </dialog>
  )
}
