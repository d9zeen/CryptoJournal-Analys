/**
 * Демо Polymarket: как закрытые позиции превращаются в сделки дневника — на данных публичного кошелька.
 * Ничего не сохраняется; кошелёк и имя трейдера не показываются — только рынки, исходы, цены и PnL.
 */
import { useEffect, useMemo, useRef } from 'react'
import { fmt, useT } from '@/i18n'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { formatDateTime, formatPnl, formatUsd, pnlClass } from '@/lib/format'
import { usePolymarketDemo } from './api'

export function PolymarketDemoDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()
  const c = t.connections.demo
  const ref = useRef<HTMLDialogElement>(null)
  const { data: trades = [], isLoading, error } = usePolymarketDemo(open)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    else if (!open && d.open) d.close()
  }, [open])

  const sorted = useMemo(() => [...trades].sort((a, b) => b.exit_at.localeCompare(a.exit_at)), [trades])
  const total = trades.reduce((s, x) => s + x.pnl, 0)
  const wins = trades.filter((x) => x.pnl > 0).length
  const price = (n: number) => n.toFixed(n === 0 || n === 1 ? 0 : 3)

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="pm-demo-title"
      className="m-auto max-h-[86vh] w-[min(980px,calc(100%-32px))] gap-3 rounded-2xl border border-border bg-surface p-4 text-text shadow-2xl backdrop:bg-bg/70 open:grid open:grid-rows-[auto_minmax(0,1fr)] sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="pm-demo-title" className="font-semibold">
            {c.title}
          </h2>
          <p className="mt-0.5 text-xs text-muted">{c.hint}</p>
          {trades.length > 0 && (
            <p className="mt-2 text-sm">
              {fmt(c.summary, { n: trades.length, wins, rate: Math.round((wins / trades.length) * 100) })}{' '}
              <span className={`num font-semibold ${pnlClass(total)}`}>{formatPnl(total)}</span>
            </p>
          )}
        </div>
        <Button variant="secondary" onClick={onClose}>
          {c.close}
        </Button>
      </div>

      <div className="min-h-0 overflow-auto">
        {isLoading && <p className="text-sm text-muted">{t.common.loading}</p>}
        {error && <Alert tone="error">{t.connections.errors.EXCHANGE_DOWN}</Alert>}
        {!isLoading && !error && (
          <ul className="flex flex-col">
            {sorted.map((tr) => (
              <li key={tr.external_id} className="flex items-start justify-between gap-3 border-t border-border py-2.5 first:border-t-0">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{tr.title}</div>
                  <div className="num mt-0.5 text-xs text-muted">
                    {formatDateTime(tr.exit_at)} · {fmt(c.row, { entry: price(tr.entry_price), exit: price(tr.exit_price), size: formatUsd(tr.size_usd) })}
                  </div>
                </div>
                <span className={`num shrink-0 text-sm font-semibold ${pnlClass(tr.pnl)}`}>{formatPnl(tr.pnl)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </dialog>
  )
}
