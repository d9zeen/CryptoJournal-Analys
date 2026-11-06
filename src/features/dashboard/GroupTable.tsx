import { useState } from 'react'
import { fmt, useT } from '@/i18n'
import { Card } from '@/components/ui/Card'
import { formatPercent, formatPnl, formatR, pnlClass } from '@/lib/format'
import type { Group } from '@/lib/calc/stats'

export type Row = { id: string; label: string; group: Group<unknown> }

type Props = {
  title: string
  hint?: string
  rows: Row[]
  /** mistakes — вместо винрейта и R показываем сумму убытков */
  mode?: 'default' | 'mistakes'
  empty?: string
  limit?: number
}

/** Таблица статистики по группам (сетапы, эмоции, ошибки, пары…) */
export function GroupTable({ title, hint, rows, mode = 'default', empty, limit = 5 }: Props) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? rows : rows.slice(0, limit)
  const c = t.dashboard.tables
  const num = 'px-2 py-2.5 text-right whitespace-nowrap'
  // полоска под названием: доля PnL (или убытков по ошибкам) от самого большого в таблице
  const val = (g: Group<unknown>) => (mode === 'mistakes' ? g.lossSum : g.pnl)
  const maxAbs = Math.max(1e-9, ...rows.map((r) => Math.abs(val(r.group))))

  return (
    <Card className="rise !p-4 [--i:10]">
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{empty}</p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th className="w-full py-1 pr-2 text-left font-normal">{c.name}</th>
              <th className={`${num} hidden font-normal sm:table-cell`}>{c.count}</th>
              {mode === 'mistakes' ? (
                <th className={`${num} font-normal`}>{c.losses}</th>
              ) : (
                <>
                  <th className={`${num} font-normal`}>{c.winrate}</th>
                  <th className={`${num} hidden font-normal sm:table-cell`}>{c.avgR}</th>
                </>
              )}
              <th className={`${num} pr-0 font-normal ${mode === 'mistakes' ? 'hidden sm:table-cell' : ''}`}>{c.pnl}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(({ id, label, group: g }) => (
              <tr key={id} className="border-t border-border">
                <td className="max-w-0 py-2.5 pr-3" title={label}>
                  <div className="truncate">{label}</div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                    <i className={`block h-full rounded-full ${val(g) >= 0 ? 'bg-profit' : 'bg-loss'}`} style={{ width: `${(Math.abs(val(g)) / maxAbs) * 100}%` }} />
                  </div>
                  {/* на телефоне число сделок — под названием, чтобы названию хватило места */}
                  <div className="text-xs text-muted sm:hidden">{fmt(t.dashboard.tooltipTrades, { n: g.count })}</div>
                </td>
                <td className={`num ${num} hidden text-muted sm:table-cell`}>{g.count}</td>
                {mode === 'mistakes' ? (
                  <td className={`num ${num} font-medium ${pnlClass(g.lossSum)}`}>{formatPnl(g.lossSum)}</td>
                ) : (
                  <>
                    <td className={num}>{formatPercent(g.winrate, 0)}</td>
                    <td className={`num ${num} hidden sm:table-cell ${pnlClass(g.avgR)}`}>{formatR(g.avgR)}</td>
                  </>
                )}
                <td className={`num ${num} pr-0 font-medium ${pnlClass(g.pnl)} ${mode === 'mistakes' ? 'hidden sm:table-cell' : ''}`}>{formatPnl(g.pnl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {rows.length > limit && (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-2 text-sm text-primary hover:underline">
          {expanded ? c.showLess : fmt(c.showAll, { n: rows.length })}
        </button>
      )}
    </Card>
  )
}
