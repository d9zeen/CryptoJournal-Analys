/**
 * Анимация B «Сканер» (предпросмотр файла; образец по смыслу — 21st.dev card-status-list):
 * первые строки файла как есть, по ним проходит свет, а над колонками всплывают метки — какие поля сайт узнал сам
 * («Дата», «Пара», «PnL»…). Метки — настоящие: из распознанного сопоставления колонок (prepared.mapping).
 * Только transform / opacity; при «уменьшить движение» — сразу итог (метки видны, света нет).
 */
import { useT } from '@/i18n'
import type { CsvTable } from '@/lib/import/csv'

const MAX_COLS = 7
const ROWS = 3

export function ScanStrip({ table, mapping, fieldLabel, title }: { table: CsvTable; mapping: Record<string, number>; fieldLabel: (f: string) => string; title: string }) {
  const t = useT()
  // узнанные колонки по порядку в файле (одна колонка — одна метка)
  const cols = Object.entries(mapping)
    .filter(([, i]) => i >= 0 && i < table.headers.length)
    .sort((a, b) => a[1] - b[1])
    .filter(([, i], k, arr) => arr.findIndex(([, j]) => j === i) === k)
    .slice(0, MAX_COLS)
  if (!cols.length) return null
  const rows = table.rows.slice(0, ROWS)
  return (
    <section data-scan aria-label={t.import.scan.title} className="rise flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted">{t.import.scan.hint}</p>
      </div>
      <div className="relative -mx-1 overflow-x-auto">
        {/* свет проходит по таблице один раз */}
        <span aria-hidden className="scan-beam pointer-events-none absolute inset-y-0 left-0 w-[18%]" />
        <table className="num w-full text-xs">
          <thead>
            <tr>
              {cols.map(([field, i], k) => (
                <th key={field} className="px-2 pt-1 pb-1.5 text-left align-bottom font-normal whitespace-nowrap text-muted">
                  {/* метка над колонкой — в потоке, а не поверх: длинная метка расширяет колонку, соседние не наезжают */}
                  <span
                    data-scan-label={field}
                    className="scan-label mb-1 block w-max rounded-full bg-primary/14 px-2 py-0.5 font-sans text-xs font-semibold text-primary"
                    style={{ animationDelay: `${0.25 + k * 0.2}s` }}
                  >
                    {fieldLabel(field)}
                  </span>
                  {table.headers[i] || `#${i + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, n) => (
              <tr key={n} className="border-t border-border">
                {cols.map(([field, i]) => (
                  <td key={field} className="max-w-48 truncate px-2 py-1.5 whitespace-nowrap">
                    {r[i] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
