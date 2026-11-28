/**
 * Панель дня в календаре (клик по дню): дата, итог дня, сделки этого дня (ссылки на сделку), заметка дня.
 * <dialog>: от 768px — панель справа, на телефоне — лист снизу; Esc и клик вне панели закрывают.
 * Заметка дня (план / итог / настроение, до 2000 символов) — функция Pro Plus: на Basic / Pro поле заблокировано, под ним UpgradeLine;
 * в базе то же самое проверяет триггер (ошибка PLAN_FEATURE → lib/errors.ts).
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { fmt, plural, useT } from '@/i18n'
import { Button } from '@/components/ui/Button'
import { SaveButton, type SaveState } from '@/components/SaveButton'
import { FormError } from '@/components/FormError'
import { SideBadge } from '@/components/SideBadge'
import { UpgradeLine } from '@/components/UpgradeLine'
import { useUsage } from '@/features/settings/api'
import { dbErrorMessage } from '@/lib/errors'
import { formatDay, formatPnl, formatTimeIn, pnlClass } from '@/lib/format'
import { NOTE_MAX, useDayNote, useSaveDayNote } from './notesApi'
import { CoinChip } from '@/features/portfolio/CoinChip'

export type DayTrade = { id: string; symbol: string; title?: string | null; side: 'long' | 'short'; exit_at: string; pnl: number }

export function DayPanel({ day, trades, timeZone, onClose }: { day: string; trades: DayTrade[]; timeZone: string; onClose: () => void }) {
  const t = useT()
  const c = t.dashboard.calendar
  const d = c.day
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el && !el.open) el.showModal()
  }, [])
  const total = trades.reduce((s, x) => s + x.pnl, 0)

  return (
    <dialog
      ref={ref}
      data-shot="day-panel"
      aria-labelledby="day-panel-title"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="day-sheet mx-0 mt-auto mb-0 max-h-[88dvh] w-full max-w-none rounded-t-2xl border border-border bg-surface p-0 text-text shadow-2xl backdrop:bg-bg/60 md:my-0 md:mr-0 md:ml-auto md:h-dvh md:max-h-none md:w-[420px] md:rounded-none md:rounded-l-2xl"
    >
      <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="day-panel-title" className="font-semibold">
              {formatDay(day)}
            </h2>
            <p className="mt-0.5 text-sm text-muted">
              {c.day.total}:{' '}
              <span data-day-total className={`num font-semibold ${trades.length ? pnlClass(total) : ''}`}>
                {trades.length ? formatPnl(total) : '—'}
              </span>
              {trades.length > 0 && <span> · {plural(trades.length, c.tradesN)}</span>}
            </p>
          </div>
          <Button variant="secondary" onClick={onClose}>
            {d.close}
          </Button>
        </div>

        {trades.length === 0 ? (
          <p className="text-sm text-muted">{d.noTrades}</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {trades.map((tr) => (
              <li key={tr.id}>
                <Link to={`/trades/${tr.id}`} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-surface-2/60">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="num w-14 shrink-0 text-xs text-muted">{formatTimeIn(tr.exit_at, timeZone)}</span>
                    <CoinChip symbol={tr.symbol} title={tr.title} className="truncate font-medium" />
                    <SideBadge side={tr.side} />
                  </span>
                  <span className={`num shrink-0 font-semibold ${pnlClass(tr.pnl)}`}>{formatPnl(tr.pnl)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link to={`/trades?day=${day}`} className="self-start text-sm text-primary hover:underline">
          {d.openList} →
        </Link>

        <NoteForm day={day} />
      </div>
    </dialog>
  )
}

function NoteForm({ day }: { day: string }) {
  const t = useT()
  const d = t.dashboard.calendar.day
  const { data: usage } = useUsage()
  const allowed = usage?.plan === 'pro_plus'
  const { data: note, isLoading } = useDayNote(day)
  const save = useSaveDayNote()
  const [text, setText] = useState('')
  const [state, setState] = useState<SaveState>('idle')
  const [error, setError] = useState<string | null>(null)
  // пришла сохранённая заметка — показываем её текст
  useEffect(() => setText(note?.text ?? ''), [note?.text])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setState('busy')
    try {
      await save.mutateAsync({ day, text })
      setState('done')
      setTimeout(() => setState('idle'), 900)
    } catch (err) {
      setState('idle')
      setError(dbErrorMessage(err, t))
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 border-t border-border pt-4">
      <label htmlFor="day-note" className="text-sm font-medium">
        {d.note}
      </label>
      <p className="-mt-1 text-xs text-muted">{d.noteHint}</p>
      <textarea
        id="day-note"
        rows={6}
        maxLength={NOTE_MAX}
        value={text}
        disabled={!allowed || isLoading}
        onChange={(e) => setText(e.target.value)}
        placeholder={d.notePlaceholder}
        className="w-full resize-y rounded-lg border border-border bg-bg/40 px-3 py-2 text-sm text-text placeholder:text-muted field-focus disabled:cursor-not-allowed disabled:opacity-60"
      />
      {allowed ? (
        <div className="flex items-center justify-between gap-3">
          <span className="num text-xs text-muted">{fmt(d.counter, { n: text.length, max: NOTE_MAX })}</span>
          <SaveButton state={state} disabled={(note?.text ?? '') === text.trim()}>
            {d.save}
          </SaveButton>
        </div>
      ) : (
        <UpgradeLine text={d.upgrade} />
      )}
      <FormError message={error} />
    </form>
  )
}
