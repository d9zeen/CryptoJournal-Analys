import { useMemo, useRef, useState, type DragEvent } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { fmt, useT } from '@/i18n'
import { useAuth } from '@/features/auth/AuthProvider'
import { useUsage } from '@/features/settings/api'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { SelectField } from '@/components/ui/Field'
import { exchangeName } from '@/lib/exchanges'
import { dbErrorMessage } from '@/lib/errors'
import { formatDateTime, formatPnl, formatUsd, pnlClass } from '@/lib/format'
import { IMPORT_PARSERS, parserFor } from '@/lib/import/registry'
import { planImport, prepareImport, type RowStatus } from '@/lib/import/plan'
import type { ColumnMapping } from '@/lib/import/mapping'
import type { MarketChoice, RowWarning } from '@/lib/import/types'
import { parseCsv, type CsvTable } from '@/lib/import/csv'
import { detectExchange } from '@/lib/import/detect'
import { stableHash } from '@/lib/import/values'
import { fetchExistingIds, useDeleteImport, useImports, useRunImport, type RunImportResult } from './api'

const MAX_BYTES = 5 * 1024 * 1024
const PREVIEW_ROWS = 100
const NO_IDS: ReadonlySet<string> = new Set()
/** Часовые пояса для выбора, в минутах от UTC */
const OFFSETS = [...Array.from({ length: 27 }, (_, i) => (i - 12) * 60), 210, 270, 330, 345, 390, 570].sort((a, b) => a - b)

const offsetLabel = (m: number) => {
  const sign = m < 0 ? '−' : '+'
  const abs = Math.abs(m)
  return `UTC${sign}${Math.floor(abs / 60)}${abs % 60 ? `:${String(abs % 60).padStart(2, '0')}` : ''}`
}

type LoadedFile = { name: string; source: string | CsvTable }

export function ImportPage() {
  const t = useT()
  const { user } = useAuth()
  /** '' — биржа определяется автоматически по файлу */
  const [exchangeChoice, setExchangeChoice] = useState('')
  const [file, setFile] = useState<LoadedFile | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [mappingOverride, setMappingOverride] = useState<ColumnMapping<string> | null>(null)
  const [offsetOverride, setOffsetOverride] = useState<number | null>(null)
  const [market, setMarket] = useState<MarketChoice>('auto')
  const [showMapping, setShowMapping] = useState(false)
  const [result, setResult] = useState<RunImportResult | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const table = useMemo(() => (file ? (typeof file.source === 'string' ? parseCsv(file.source) : file.source) : null), [file])
  const detected = useMemo(() => (table && file ? detectExchange(table.headers, file.name) : 'other'), [table, file])
  const exchange = exchangeChoice || detected
  const parser = parserFor(exchange)!
  const { data: usage } = useUsage()
  const run = useRunImport()

  const prepared = useMemo(
    () => (table ? prepareImport(table, parser, { mapping: mappingOverride ?? undefined, utcOffsetMinutes: offsetOverride ?? undefined, market }) : null),
    [table, parser, mappingOverride, offsetOverride, market],
  )

  const ids = useMemo(() => prepared?.rows.flatMap((r) => (r.trade ? [r.trade.external_id] : [])) ?? [], [prepared])
  const existing = useQuery({
    queryKey: ['importCheck', user?.id, exchange, stableHash(ids.join(','))],
    enabled: ids.length > 0,
    queryFn: () => fetchExistingIds(exchange, ids),
  })

  const remaining = usage && usage.trade_limit !== null ? Math.max(0, usage.trade_limit - usage.trades_created) : null
  // если в файле нет ни одной годной строки — проверять дубли не нужно
  const existingIds = ids.length === 0 ? NO_IDS : existing.data
  const plan = useMemo(
    () => (prepared && existingIds ? planImport(prepared.rows, existingIds, remaining) : null),
    [prepared, existingIds, remaining],
  )

  const warnings = useMemo(() => {
    const count = new Map<RowWarning, number>()
    for (const r of prepared?.rows ?? []) for (const w of r.warnings) count.set(w, (count.get(w) ?? 0) + 1)
    return count
  }, [prepared])

  async function loadFile(f: File | undefined) {
    if (!f) return
    setResult(null)
    setFileError(null)
    setMappingOverride(null)
    setOffsetOverride(null)
    setExchangeChoice('')
    if (f.size > MAX_BYTES) {
      setFile(null)
      setFileError(t.import.tooBig)
      return
    }
    try {
      // Excel читаем отдельным модулем — он грузится, только когда нужен
      const { readTableFile } = await import('@/lib/import/xlsx')
      setFile({ name: f.name, source: await readTableFile(f) })
      setShowMapping(false)
    } catch {
      setFile(null)
      setFileError(t.import.readError)
    }
  }

  // файл можно бросить в любое место страницы
  const dropProps = {
    onDragOver: (e: DragEvent) => {
      e.preventDefault()
      setDragging(true)
    },
    onDragLeave: (e: DragEvent) => {
      if (e.currentTarget === e.target) setDragging(false)
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault()
      setDragging(false)
      void loadFile(e.dataTransfer.files[0])
    },
  }

  async function submit() {
    if (!plan || !file || !prepared) return
    const res = await run.mutateAsync({ exchange, filename: file.name, rowsTotal: prepared.rows.length, trades: plan.toInsert })
    setResult(res)
    setFile(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const requiredFields = new Set<string>(parser.required(prepared?.mode ?? null))
  const fieldLabel = (f: string) => (t.import.fields as Record<string, string>)[f] ?? f
  const mappingOpen = showMapping || (prepared?.missing.length ?? 0) > 0

  return (
    <div className="flex flex-col gap-4" {...dropProps}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-xl font-semibold">{t.import.title}</h1>
        {usage && usage.trade_limit !== null && (
          <p className={`text-sm ${remaining === 0 ? 'text-loss' : 'text-muted'}`}>{fmt(t.tradeForm.usage, { used: usage.trades_created, limit: usage.trade_limit })}</p>
        )}
      </div>

      {result && <ResultAlert result={result} />}
      {run.error && <Alert tone="error">{dbErrorMessage(run.error, t)}</Alert>}

      <div className="grid gap-4 xl:grid-cols-[400px_minmax(0,1fr)] xl:items-start">
        {/* Слева: файл, подсказки, история */}
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-4 !p-4">
            <label
              className={`flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed px-4 py-10 text-center transition-colors ${dragging ? 'border-primary bg-primary/10' : 'border-border hover:border-muted'}`}
            >
              <svg viewBox="0 0 24 24" className="size-8 text-muted" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
                <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="font-medium">{file ? file.name : t.import.drop}</span>
              <span className="text-xs text-muted">{file ? fmt(t.import.rowsInFile, { n: table?.rows.length ?? 0 }) : t.import.supported}</span>
              <span className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary">{file ? t.import.another : t.import.pick}</span>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.xlsx,.txt,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                onChange={(e) => void loadFile(e.target.files?.[0])}
              />
            </label>
            {fileError && <Alert tone="error">{fileError}</Alert>}

            {file && (
              <div className="grid grid-cols-2 gap-3">
                <SelectField
                  label={t.import.exchange}
                  value={exchangeChoice}
                  onChange={(e) => {
                    setExchangeChoice(e.target.value)
                    setMappingOverride(null)
                  }}
                >
                  <option value="">{fmt(t.import.exchangeAuto, { name: exchangeName(detected, t.exchange.other) })}</option>
                  {IMPORT_PARSERS.map((p) => (
                    <option key={p.exchange} value={p.exchange}>
                      {exchangeName(p.exchange, t.exchange.other)}
                    </option>
                  ))}
                </SelectField>
                <SelectField label={t.import.market} value={market} onChange={(e) => setMarket(e.target.value as MarketChoice)}>
                  <option value="auto">{t.import.marketAuto}</option>
                  <option value="linear">{t.market.linear}</option>
                  <option value="inverse">{t.market.inverse}</option>
                  <option value="spot">{t.market.spot}</option>
                </SelectField>
              </div>
            )}
          </Card>

          <details className="group rounded-xl border border-border bg-surface p-4">
            <summary className="cursor-pointer list-none font-medium marker:hidden">
              <span className="text-muted group-open:hidden">▸ </span>
              <span className="hidden text-muted group-open:inline">▾ </span>
              {t.import.howToTitle}
            </summary>
            <dl className="mt-3 flex flex-col gap-2 text-sm">
              {IMPORT_PARSERS.map((p) => (
                <div key={p.exchange}>
                  <dt className="font-medium">{exchangeName(p.exchange, t.exchange.other)}</dt>
                  <dd className="text-muted">{(t.import.howTo as Record<string, string>)[p.exchange]}</dd>
                </div>
              ))}
            </dl>
          </details>

          <div className="hidden xl:block">
            <ImportHistory />
          </div>
        </div>

        {/* Справа: результат разбора */}
        <div className="flex min-w-0 flex-col gap-4">
          {!file && <Card className="hidden min-h-64 items-center justify-center text-center text-muted xl:flex">{t.import.previewEmpty}</Card>}

          {prepared && prepared.table.rows.length === 0 && <Alert tone="error">{t.import.emptyFile}</Alert>}

          {prepared && prepared.table.rows.length > 0 && prepared.missing.length > 0 && (
            <Alert tone="error">{prepared.mode === null ? t.import.formatUnknown : fmt(t.import.missing, { fields: prepared.missing.map(fieldLabel).join(', ') })}</Alert>
          )}

          {prepared && prepared.missing.length === 0 && prepared.table.rows.length > 0 && (
            <>
              {existing.isLoading && <p className="text-sm text-muted">{t.import.checking}</p>}
              {existing.error && <Alert tone="error">{dbErrorMessage(existing.error, t)}</Alert>}

              {plan && (
                <Card className="flex flex-col gap-3 !p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-2 text-sm">
                      <Badge status="new">{fmt(t.import.summary.new, { n: plan.counts.new })}</Badge>
                      {plan.counts.duplicate > 0 && <Badge status="duplicate">{fmt(t.import.summary.duplicate, { n: plan.counts.duplicate })}</Badge>}
                      {plan.counts.error > 0 && <Badge status="error">{fmt(t.import.summary.error, { n: plan.counts.error })}</Badge>}
                      {plan.counts.overLimit > 0 && <Badge status="overLimit">{fmt(t.import.summary.overLimit, { n: plan.counts.overLimit })}</Badge>}
                    </div>
                    {plan.toInsert.length === 0 && plan.counts.duplicate > 0 ? (
                      <p className="text-sm text-muted">{t.import.nothing}</p>
                    ) : (
                      <Button onClick={() => void submit()} loading={run.isPending} disabled={plan.toInsert.length === 0}>
                        {run.isPending ? t.import.submitting : fmt(t.import.submit, { n: plan.toInsert.length })}
                      </Button>
                    )}
                  </div>

                  <p className="text-xs text-muted">{prepared.mode === 'fills' ? fmt(t.import.formatFills, { rows: prepared.table.rows.length }) : t.import.formatPositions}</p>
                  {prepared.sideFallback && <p className="text-xs text-warning">{t.import.sideFallback[prepared.sideFallback]}</p>}
                  {plan.counts.overLimit > 0 && remaining !== null && <p className="text-sm text-warning">{fmt(t.import.overLimitNote, { n: remaining })}</p>}
                  {warnings.has('noEntryTime') && <p className="text-xs text-muted">{t.import.warnings.noEntryTime}</p>}
                  {warnings.has('feeDerived') && <p className="text-xs text-muted">{fmt(t.import.warnings.feeDerived, { n: warnings.get('feeDerived')! })}</p>}
                  {warnings.has('pnlFromFile') && <p className="text-xs text-muted">{fmt(t.import.warnings.pnlFromFile, { n: warnings.get('pnlFromFile')! })}</p>}
                  {warnings.has('feeNotUsd') && <p className="text-xs text-warning">{fmt(t.import.warnings.feeNotUsd, { n: warnings.get('feeNotUsd')! })}</p>}

                  <div className="-mx-4 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs text-muted">
                        <tr>
                          <th className="hidden px-4 py-2 font-normal sm:table-cell">{t.import.col.line}</th>
                          <th className="px-4 py-2 font-normal">{t.import.col.status}</th>
                          <th className="px-2 py-2 font-normal">{t.import.col.trade}</th>
                          <th className="hidden px-2 py-2 font-normal md:table-cell">{t.import.col.exitAt}</th>
                          <th className="hidden px-2 py-2 text-right font-normal sm:table-cell">{t.import.col.size}</th>
                          <th className="px-4 py-2 text-right font-normal">{t.import.col.pnl}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {prepared.rows.slice(0, PREVIEW_ROWS).map((r, idx) => {
                          const status = plan.status.get(idx)!
                          return (
                            <tr key={idx} className="border-t border-border">
                              <td className="hidden whitespace-nowrap px-4 py-2 text-muted sm:table-cell">{r.lineTo && r.lineTo !== r.line ? `${r.line}–${r.lineTo}` : r.line}</td>
                              <td className="px-4 py-2">
                                <Badge status={status}>{t.import.status[status]}</Badge>
                              </td>
                              <td className="px-2 py-2">
                                {r.trade ? (
                                  <>
                                    <span className="font-medium">{r.trade.symbol}</span>{' '}
                                    <span className={r.trade.side === 'long' ? 'text-profit' : 'text-loss'}>{t.side[r.trade.side]}</span>
                                    <div className="text-xs text-muted md:hidden">{formatDateTime(r.trade.exit_at)}</div>
                                  </>
                                ) : (
                                  <span className="text-loss">
                                    {r.lineTo && r.lineTo !== r.line ? fmt(t.import.lines, { from: r.line, to: r.lineTo }) : `${t.import.col.line} ${r.line}`}: {t.import.rowError[r.error!]}
                                    {r.detail ? `: «${r.detail}»` : ''}
                                  </span>
                                )}
                              </td>
                              <td className="hidden whitespace-nowrap px-2 py-2 text-muted md:table-cell">{r.trade ? formatDateTime(r.trade.exit_at) : ''}</td>
                              <td className="hidden whitespace-nowrap px-2 py-2 text-right sm:table-cell">{r.trade ? formatUsd(r.trade.size_usd) : ''}</td>
                              <td className={`whitespace-nowrap px-4 py-2 text-right font-medium ${pnlClass(r.trade?.pnl)}`}>{r.trade ? formatPnl(r.trade.pnl) : ''}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {prepared.rows.length > PREVIEW_ROWS && <p className="text-xs text-muted">{fmt(t.import.previewMore, { shown: PREVIEW_ROWS, n: prepared.rows.length })}</p>}
                </Card>
              )}
            </>
          )}

          {/* Ручная настройка колонок — нужна, только если файл не распознался */}
          {prepared && prepared.table.rows.length > 0 && (
            <div className="rounded-xl border border-border bg-surface p-4">
              <button type="button" className="text-sm text-muted hover:text-text" onClick={() => setShowMapping((v) => !v)} aria-expanded={mappingOpen}>
                {mappingOpen ? '▾ ' : '▸ '}
                {t.import.mapping}
              </button>
              {mappingOpen && (
                <div className="mt-3 flex flex-col gap-3">
                  <p className="text-xs text-muted">{t.import.mappingHint}</p>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-5">
                    {Object.keys(parser.fields).map((f) => (
                      <SelectField
                        key={f}
                        label={`${fieldLabel(f)}${requiredFields.has(f) ? ' *' : ''}`}
                        value={prepared.mapping[f]}
                        onChange={(e) => setMappingOverride({ ...prepared.mapping, [f]: Number(e.target.value) })}
                      >
                        <option value={-1}>{t.import.notInFile}</option>
                        {prepared.table.headers.map((h, i) => (
                          <option key={i} value={i}>
                            {h || `#${i + 1}`}
                          </option>
                        ))}
                      </SelectField>
                    ))}
                    <SelectField
                      label={t.import.timezone}
                      hint={prepared.offsetDetected && offsetOverride === null ? t.import.timezoneDetected : t.import.timezoneGuess}
                      value={prepared.utcOffsetMinutes}
                      onChange={(e) => setOffsetOverride(Number(e.target.value))}
                    >
                      {OFFSETS.map((m) => (
                        <option key={m} value={m}>
                          {offsetLabel(m)}
                        </option>
                      ))}
                    </SelectField>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="xl:hidden">
            <ImportHistory />
          </div>
        </div>
      </div>
    </div>
  )
}

const badgeStyles: Record<RowStatus, string> = {
  new: 'bg-profit/15 text-profit',
  duplicate: 'bg-surface-2 text-muted',
  error: 'bg-loss/15 text-loss',
  overLimit: 'bg-warning/15 text-warning',
}

function Badge({ status, children }: { status: RowStatus; children: string }) {
  return <span className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium ${badgeStyles[status]}`}>{children}</span>
}

function ResultAlert({ result }: { result: RunImportResult }) {
  const t = useT()
  const stopped = result.error !== null
  return (
    <Alert tone={stopped ? 'error' : 'success'}>
      <p>
        {stopped ? fmt(t.import.stopped, { n: result.inserted }) : fmt(t.import.done, { n: result.inserted })}
        {result.duplicates > 0 && ` ${fmt(t.import.doneDuplicates, { n: result.duplicates })}`}
      </p>
      {stopped && <p className="mt-1">{dbErrorMessage(result.error, t)}</p>}
      {result.inserted > 0 && (
        <Link to="/trades" className="mt-1 inline-block underline">
          {t.import.toTrades}
        </Link>
      )}
    </Alert>
  )
}

function ImportHistory() {
  const t = useT()
  const { data: imports = [] } = useImports()
  const del = useDeleteImport()

  return (
    <Card className="!p-4">
      <h2 className="font-medium">{t.import.history}</h2>
      {del.error && (
        <div className="mt-2">
          <Alert tone="error">{dbErrorMessage(del.error, t)}</Alert>
        </div>
      )}
      {imports.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{t.import.historyEmpty}</p>
      ) : (
        <ul className="mt-2 flex flex-col">
          {imports.map((imp) => (
            <li key={imp.id} className="flex items-center justify-between gap-3 border-t border-border py-2 first:border-t-0">
              <div className="min-w-0">
                <div className="truncate text-sm">
                  {exchangeName(imp.exchange, t.exchange.other)}
                  {imp.filename && <span className="text-muted"> · {imp.filename}</span>}
                </div>
                <div className="text-xs text-muted">
                  {fmt(t.import.historyRow, { date: formatDateTime(imp.created_at), imported: imp.rows_imported, total: imp.rows_total })}
                </div>
              </div>
              <Button
                variant="ghost"
                className="shrink-0 py-1.5"
                loading={del.isPending && del.variables === imp.id}
                onClick={() => {
                  if (window.confirm(fmt(t.import.undoConfirm, { n: imp.rows_imported }))) del.mutate(imp.id)
                }}
              >
                {t.import.undo}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
