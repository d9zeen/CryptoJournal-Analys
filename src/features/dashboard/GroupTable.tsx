import { useState, type CSSProperties } from 'react'
import { RollNumber } from '@/components/RollNumber'
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
  /** номер в лесенке появления (№7) */
  i?: number
  /** сменился (период) — суммы прокручиваются (№13) */
  rollKey?: unknown
}

/** Таблица статистики по группам (сетапы, эмоции, ошибки, пары…) */
export function GroupTable({ title, hint, rows, mode = 'default', empty, limit = 5, i = 0, rollKey }: Props) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? rows : rows.slice(0, limit)
  const c = t.dashboard.tables
  const num = 'px-2 py-2.5 text-right whitespace-nowrap'
  // полоска под названием — PnL от середины: плюс вправо (--color-up), минус влево (--color-down), длина — доля от самого большого |PnL| в таблице
  const val = (g: Group<unknown>) => (mode === 'mistakes' ? g.lossSum : g.pnl)
  const maxAbs = Math.max(1e-9, ...rows.map((r) => Math.abs(val(r.group))))

  return (
    <Card className="rise !p-4" style={{ '--i': i } as CSSProperties}>
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{empty}</p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th className="w-full py-1 pr-2 text-left font-normal">{c.name}</th>
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
                {/* название ужимается и переносится, деньги — никогда: у колонок с суммами whitespace-nowrap и ширина по содержимому */}
                <td className="max-w-0 py-2.5 pr-3" title={label}>
                  <div className="[overflow-wrap:anywhere]">{label}</div>
                  <div data-bar className="relative mt-1.5 h-1 rounded-full bg-surface-2" aria-hidden>
                    <i className="absolute inset-y-[-2px] left-1/2 w-px bg-border" />
                    <i
                      className={`absolute inset-y-0 ${val(g) >= 0 ? 'left-1/2 rounded-r-full bg-up' : 'right-1/2 rounded-l-full bg-down'}`}
                      style={{ width: `${(Math.abs(val(g)) / maxAbs) * 50}%` }}
                    />
                  </div>
                  {/* число сделок — под названием на всех ширинах (отдельной колонки нет — суммам хватает места) */}
                  <div className="mt-1 text-xs text-muted">{fmt(t.dashboard.tooltipTrades, { n: g.count })}</div>
                </td>
                {mode === 'mistakes' ? (
                  <td data-money className={`num ${num} font-medium ${pnlClass(g.lossSum)}`}>
                    <RollNumber text={formatPnl(g.lossSum)} token={rollKey} />
                  </td>
                ) : (
                  <>
                    <td className={num}>{formatPercent(g.winrate, 0)}</td>
                    <td className={`num ${num} hidden sm:table-cell ${pnlClass(g.avgR)}`}>{formatR(g.avgR)}</td>
                  </>
                )}
                <td data-money className={`num ${num} pr-0 font-medium ${pnlClass(g.pnl)} ${mode === 'mistakes' ? 'hidden sm:table-cell' : ''}`}>
                  <RollNumber text={formatPnl(g.pnl)} token={rollKey} />
                </td>
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
