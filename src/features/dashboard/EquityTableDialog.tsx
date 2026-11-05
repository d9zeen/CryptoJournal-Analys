/**
 * «Таблица сделок» к кривой капитала — отдельное окно (<dialog>).
 * Новые сделки сверху; итог и просадка от пика — в выбранных единицах ($ / %).
 * Длинные списки рисуются порциями по 100 (как список сделок), клик по строке открывает сделку.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { fmt, useT } from '@/i18n'
import type { EquityPoint } from '@/lib/calc/stats'
import { formatDateTime, pnlClass } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { formatUnit, inUnit, type EquityUnit } from './equityTime'

const PAGE = 100

type Props = { open: boolean; onClose: () => void; curve: EquityPoint[]; unit: EquityUnit; balance: number | null }

export function EquityTableDialog({ open, onClose, curve, unit, balance }: Props) {
  const t = useT()
  const c = t.dashboard.charts
  const navigate = useNavigate()
  const ref = useRef<HTMLDialogElement>(null)
  const [shown, setShown] = useState(PAGE)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      setShown(PAGE)
      d.showModal()
    } else if (!open && d.open) d.close()
  }, [open])

  const rows = useMemo(() => {
    let peak = 0
    const out = curve.slice(1).map((p) => {
      peak = Math.max(peak, p.cum)
      return { ...p, fromPeak: p.cum - peak }
    })
    return out.reverse()
  }, [curve])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="equity-table-title"
      className="m-auto max-h-[86vh] w-[min(900px,calc(100%-32px))] gap-3 rounded-2xl border border-border bg-surface p-4 text-text shadow-2xl backdrop:bg-bg/70 open:grid open:grid-rows-[auto_minmax(0,1fr)] sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="equity-table-title" className="font-semibold">
            {c.table}
          </h2>
          <p className="mt-0.5 text-xs text-muted">{fmt(c.tableHint, { n: rows.length })}</p>
        </div>
        <Button variant="secondary" onClick={onClose}>
          {c.close}
        </Button>
      </div>
      <div className="min-h-0 overflow-auto rounded-xl border border-border">
        <table className="w-full min-w-[520px] text-[13px]">
          <thead className="sticky top-0 bg-surface text-xs text-muted">
            <tr>
              <th className="px-3 py-2 text-left font-normal">{c.tableCols.date}</th>
              <th className="px-3 py-2 text-left font-normal">{c.tableCols.symbol}</th>
              <th className="px-3 py-2 text-right font-normal">{c.tableCols.trade}</th>
              <th className="px-3 py-2 text-right font-normal">{c.tableCols.total}</th>
              <th className="px-3 py-2 text-right font-normal">{c.tableCols.fromPeak}</th>
            </tr>
          </thead>
          <tbody>
            {open &&
              rows.slice(0, shown).map((r) => {
                const trade = inUnit(r.pnl, unit, balance)
                const total = inUnit(r.cum, unit, balance)
                const dd = inUnit(r.fromPeak, unit, balance)
                return (
                  <tr key={r.n} onClick={() => r.id && navigate(`/trades/${r.id}`)} className="num cursor-pointer border-t border-border transition-colors hover:bg-surface-2/60">
                    <td className="px-3 py-2 whitespace-nowrap text-muted">{formatDateTime(r.at)}</td>
                    <td className="px-3 py-2 font-semibold">{r.symbol}</td>
                    <td className={`px-3 py-2 text-right whitespace-nowrap ${pnlClass(trade)}`}>{formatUnit(trade, unit)}</td>
                    <td className={`px-3 py-2 text-right whitespace-nowrap ${pnlClass(total)}`}>{formatUnit(total, unit)}</td>
                    <td className={`px-3 py-2 text-right whitespace-nowrap ${dd < -1e-9 ? 'text-loss' : 'text-muted'}`}>{dd < -1e-9 ? formatUnit(dd, unit) : '—'}</td>
                  </tr>
                )
              })}
          </tbody>
        </table>
        {open && rows.length > shown && (
          <div className="border-t border-border p-2 text-center">
            <Button variant="ghost" onClick={() => setShown((n) => n + PAGE)}>
              {fmt(c.more, { n: Math.min(PAGE, rows.length - shown) })}
            </Button>
          </div>
        )}
      </div>
    </dialog>
  )
}
