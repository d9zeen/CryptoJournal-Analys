/**
 * Одна широкая таблица «Разбора» (сетапы, ошибки, пары, эмоции, время суток, плечо) — образец 21st.dev inline-analytics-table:
 * сортировка по клику на заголовок (PnL, винрейт, число сделок; для ошибок — убытки), внизу строка «Итого».
 * Деньги не обрезаются (data-money, e2e); полоска — PnL от середины, в «Ошибках» — красная справа налево.
 */
import { useState, type CSSProperties } from 'react'
import { RollNumber } from '@/components/RollNumber'
import { fmt, useT } from '@/i18n'
import { Card } from '@/components/ui/Card'
import { formatPercent, formatPnl, formatR, pnlClass } from '@/lib/format'
import { avgMistakeLoss, sortGroups, type Group, type GroupSortKey } from '@/lib/calc/stats'

export type Row = { id: string; label: string; group: Group<unknown> }

type Props = {
  title: string
  hint?: string
  rows: Row[]
  /** «Итого» по всем сделкам периода (сделка с двумя тегами — один раз) */
  total?: Group<unknown>
  /** mistakes — вместо винрейта и R: средний убыток и сумма убытков */
  mode?: 'default' | 'mistakes'
  empty?: string
  limit?: number
  /** номер в лесенке появления (№7) */
  i?: number
  /** сменился (период) — суммы прокручиваются (№13) */
  rollKey?: unknown
  /** «Разбор»: выбранная строка (её сделки — карточками справа) и выбор строки кликом / Enter */
  selectedId?: string | null
  onSelect?: (id: string) => void
  /** плотнее строки (под лентой сделок в «Разборе») */
  compact?: boolean
  /** заголовок над таблицей виден (во вкладке «Поведение» таблиц несколько) */
  showTitle?: boolean
  /** строки в данном порядке, пока не нажали на заголовок (серия 0 → 3+, время от коротких к долгим) */
  keepOrder?: boolean
}

export function GroupTable({ title, hint, rows, total, mode = 'default', empty, limit = 12, i = 0, rollKey, selectedId, onSelect, compact = false, showTitle = false, keepOrder = false }: Props) {
  const t = useT()
  const c = t.dashboard.tables
  const mistakes = mode === 'mistakes'
  // по умолчанию — по PnL (в «Ошибках» — по убыткам: самые дорогие сверху)
  // keepOrder — без сортировки, пока не нажали на заголовок (null)
  const [sort, setSort] = useState<{ key: GroupSortKey; dir: 'asc' | 'desc' } | null>(keepOrder ? null : { key: mistakes ? 'loss' : 'pnl', dir: 'desc' })
  const [expanded, setExpanded] = useState(false)
  const sorted = sort
    ? sortGroups(
        rows.map((r) => r.group),
        sort.key,
        sort.dir,
      ).map((g) => rows.find((r) => r.group === g)!)
    : rows
  const visible = expanded ? sorted : sorted.slice(0, limit)
  const py = compact ? 'py-1.5' : 'py-2.5'
  const num = `px-2 ${py} text-right whitespace-nowrap sm:px-3`
  const val = (g: Group<unknown>) => (mistakes ? g.lossSum : g.pnl)
  const maxAbs = Math.max(1e-9, ...rows.map((r) => Math.abs(val(r.group))))

  const th = (key: GroupSortKey | null, label: string, extra = '') => {
    if (!key) return <th className={`${num} border-b-2 border-transparent font-normal ${extra}`}>{label}</th>
    const active = sort?.key === key
    return (
      // как в образце: под активным заголовком — линия цвета кнопок
      <th aria-sort={active ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={`${num} border-b-2 font-normal ${active ? 'border-primary' : 'border-transparent'} ${extra}`}>
        <button
          type="button"
          aria-label={fmt(t.analysis.sortBy, { col: label })}
          onClick={() => setSort((s) => (s?.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }))}
          className={`group -my-1 inline-flex items-center gap-1 py-1 transition-colors hover:text-text ${active ? 'font-medium text-text' : ''}`}
        >
          <span aria-hidden className={`text-[10px] ${active ? '' : 'opacity-0 group-hover:opacity-40'}`}>
            {active && sort?.dir === 'asc' ? '▲' : '▼'}
          </span>
          {label}
        </button>
      </th>
    )
  }

  return (
    <Card className={`rise ${compact ? '!px-4 !py-3 sm:!px-5' : '!p-4 sm:!p-5'}`} style={{ '--i': i } as CSSProperties}>
      <h2 className={showTitle ? 'mb-1 text-sm font-semibold' : 'sr-only'}>{title}</h2>
      {hint && <p className="mb-2 text-xs text-muted">{hint}</p>}
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <table data-shot="analysis-table" className="w-full text-sm">
          <thead className="align-bottom text-xs text-muted">
            <tr>
              <th className={`w-full border-b-2 border-transparent py-2.5 pr-3 text-left font-normal ${onSelect ? 'pl-3' : ''}`}>{c.name}</th>
              {th('count', c.count, 'hidden sm:table-cell')}
              {mistakes ? (
                <>
                  {th(null, c.avgLoss)}
                  {th('loss', c.losses, 'pr-0')}
                </>
              ) : (
                <>
                  {th('winrate', c.winrate)}
                  {th(null, c.avgR, 'hidden sm:table-cell')}
                  {th('pnl', c.pnl, 'pr-0')}
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {visible.map(({ id, label, group: g }) => (
              <tr
                key={id}
                data-row={id}
                aria-selected={onSelect ? selectedId === id : undefined}
                tabIndex={onSelect ? 0 : undefined}
                onClick={onSelect ? () => onSelect(id) : undefined}
                onKeyDown={
                  onSelect
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onSelect(id)
                        }
                      }
                    : undefined
                }
                className={`border-t border-border ${onSelect ? 'cursor-pointer transition-colors hover:bg-surface-2/50 focus-visible:outline-2 focus-visible:outline-primary' : ''} ${
                  selectedId === id ? 'bg-primary/10 shadow-[inset_3px_0_0_var(--color-primary)]' : ''
                }`}
              >
                {/* название ужимается и переносится, деньги — никогда: у колонок с суммами whitespace-nowrap и ширина по содержимому */}
                <td className={`max-w-0 ${py} pr-3 ${onSelect ? 'pl-3' : ''}`} title={label}>
                  <div className="[overflow-wrap:anywhere]">{label}</div>
                  {/* на телефоне колонки «Сделок» нет (тесно для сумм) — число под названием */}
                  <div className="mt-1 text-xs text-muted sm:hidden">{fmt(t.dashboard.tooltipTrades, { n: g.count })}</div>
                  {mistakes ? (
                    <div data-bar="loss" className="relative mt-1.5 h-1 max-w-md rounded-full bg-surface-2" aria-hidden>
                      <i className="absolute inset-y-0 right-0 rounded-full bg-down" style={{ width: `${(Math.abs(val(g)) / maxAbs) * 100}%` }} />
                    </div>
                  ) : (
                    <div data-bar className="relative mt-1.5 h-1 max-w-md rounded-full bg-surface-2" aria-hidden>
                      <i className="absolute inset-y-[-2px] left-1/2 w-px bg-border" />
                      <i
                        className={`absolute inset-y-0 ${val(g) >= 0 ? 'left-1/2 rounded-r-full bg-up' : 'right-1/2 rounded-l-full bg-down'}`}
                        style={{ width: `${(Math.abs(val(g)) / maxAbs) * 50}%` }}
                      />
                    </div>
                  )}
                </td>
                <td className={`num ${num} hidden text-muted sm:table-cell`}>{g.count}</td>
                {mistakes ? (
                  <>
                    <td data-money className={`num ${num} ${pnlClass(avgMistakeLoss(g))}`}>
                      <RollNumber text={formatPnl(avgMistakeLoss(g))} token={rollKey} />
                    </td>
                    <td data-money className={`num ${num} pr-0 font-medium ${pnlClass(g.lossSum)}`}>
                      <RollNumber text={formatPnl(g.lossSum)} token={rollKey} />
                    </td>
                  </>
                ) : (
                  <>
                    <td className={num}>{formatPercent(g.winrate, 0)}</td>
                    <td className={`num ${num} hidden sm:table-cell ${pnlClass(g.avgR)}`}>{formatR(g.avgR)}</td>
                    <td data-money className={`num ${num} pr-0 font-medium ${pnlClass(g.pnl)}`}>
                      <RollNumber text={formatPnl(g.pnl)} token={rollKey} />
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
          {total && (
            <tfoot>
              {/* «Итого» — как Total в образце: отдельная строка с фоном */}
              <tr data-total className="border-t-2 border-border bg-surface-2/60 font-semibold">
                <td className={`rounded-l-md ${py} pr-3 pl-2`}>
                  {t.analysis.total}
                  <div className="text-xs font-normal text-muted sm:hidden">{fmt(t.dashboard.tooltipTrades, { n: total.count })}</div>
                </td>
                <td className={`num ${num} hidden sm:table-cell`}>{total.count}</td>
                {mistakes ? (
                  <>
                    <td data-money className={`num ${num} ${pnlClass(avgMistakeLoss(total))}`}>
                      {formatPnl(avgMistakeLoss(total))}
                    </td>
                    <td data-money className={`num ${num} rounded-r-md pr-2 ${pnlClass(total.lossSum)}`}>
                      {formatPnl(total.lossSum)}
                    </td>
                  </>
                ) : (
                  <>
                    <td className={num}>{formatPercent(total.winrate, 0)}</td>
                    <td className={`num ${num} hidden sm:table-cell ${pnlClass(total.avgR)}`}>{formatR(total.avgR)}</td>
                    <td data-money className={`num ${num} rounded-r-md pr-2 ${pnlClass(total.pnl)}`}>
                      {formatPnl(total.pnl)}
                    </td>
                  </>
                )}
              </tr>
            </tfoot>
          )}
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
