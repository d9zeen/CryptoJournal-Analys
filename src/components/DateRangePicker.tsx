/**
 * Календарь «Свой диапазон»: быстрые варианты слева, один или два месяца справа.
 * Первый клик — начало, второй — конец (если раньше начала — меняем местами), при наведении диапазон подсвечивается.
 * Ничего не применяется, пока не нажата «Применить». На телефоне — панель снизу экрана.
 */
import { useEffect, useMemo, useState, type RefObject } from 'react'
import { fmt, useT } from '@/i18n'
import { daysInRange, monthGrid, parseYmd, QUICK_RANGES, quickRange, ymd, type CustomRange } from '@/lib/period'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { Button } from '@/components/ui/Button'

type Props = {
  value: CustomRange
  onApply: (r: CustomRange) => void
  onClose: () => void
  /** контейнер вместе с кнопкой — клик внутри него не закрывает календарь */
  anchor: RefObject<HTMLElement | null>
}

const monthName = new Intl.DateTimeFormat('ru-RU', { month: 'long' })
const dayLong = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })
const fullDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })

/** «5 ноября», год — только если не текущий */
export function formatDay(s: string, now = new Date()): string {
  const d = parseYmd(s)
  return d.getFullYear() === now.getFullYear() ? dayLong.format(d) : fullDate.format(d)
}

/** «6 — 18 октября», «28 сентября — 3 октября», «5 ноября» */
export function formatRange(r: CustomRange, now = new Date()): string {
  const to = r.to || r.from
  if (to === r.from) return formatDay(r.from, now)
  const a = parseYmd(r.from)
  const b = parseYmd(to)
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) return `${a.getDate()} — ${formatDay(to, now)}`
  return `${formatDay(r.from, now)} — ${formatDay(to, now)}`
}

export function DateRangePicker({ value, onApply, onClose, anchor }: Props) {
  const t = useT()
  const p = t.period
  const two = useMediaQuery('(min-width: 640px)')
  const today = ymd(new Date())
  const [draft, setDraft] = useState<CustomRange>(value)
  const [hover, setHover] = useState<string | null>(null)
  // первый показанный месяц: тот, где конец диапазона (на двух месяцах — предыдущий рядом)
  const [view, setView] = useState(() => {
    const base = value.to ? parseYmd(value.to) : new Date()
    return new Date(base.getFullYear(), base.getMonth() - (two ? 1 : 0), 1)
  })

  // Esc и клик мимо — закрыть
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const onDown = (e: PointerEvent) => {
      if (anchor.current && !anchor.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [onClose, anchor])

  function pick(day: string) {
    if (!draft.from || draft.to) setDraft({ from: day, to: '' })
    else if (day < draft.from) setDraft({ from: day, to: draft.from })
    else setDraft({ from: draft.from, to: day })
  }

  // конец для подсветки: выбранный или тот, на который наведена мышь
  const end = draft.to || (draft.from && hover && hover >= draft.from ? hover : '')
  const start = draft.from && hover && !draft.to && hover < draft.from ? hover : draft.from
  const lo = start
  const hi = end || draft.from

  const months = useMemo(() => {
    const list = [view]
    if (two) list.push(new Date(view.getFullYear(), view.getMonth() + 1, 1))
    return list
  }, [view, two])

  const shift = (n: number) => setView(new Date(view.getFullYear(), view.getMonth() + n, 1))
  const applied = draft.from ? { from: draft.from, to: draft.to || draft.from } : null
  // что показать внизу: пока конец не выбран — предварительный диапазон под мышью
  const shown = lo ? { from: lo, to: hi || lo } : null
  const activeQuick = QUICK_RANGES.find((k) => {
    const q = quickRange(k)
    return applied && q.from === applied.from && q.to === applied.to
  })

  return (
    <>
      {/* затемнение на телефоне */}
      <div className="fixed inset-0 z-40 bg-bg/60 sm:hidden" aria-hidden onClick={onClose} />
      <div
        role="dialog"
        aria-label={p.custom}
        className="rise fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col overflow-auto rounded-t-2xl border border-border bg-surface pb-[env(safe-area-inset-bottom)] shadow-2xl sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:bottom-auto sm:mt-2 sm:max-h-none sm:flex-row sm:rounded-2xl sm:pb-0"
      >
        {/* Быстрые варианты */}
        <div className="flex gap-1.5 overflow-x-auto border-b border-border p-3 sm:w-40 sm:flex-col sm:overflow-visible sm:border-r sm:border-b-0">
          {QUICK_RANGES.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                const q = quickRange(k)
                setDraft(q)
                const base = parseYmd(q.to)
                setView(new Date(base.getFullYear(), base.getMonth() - (two ? 1 : 0), 1))
              }}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-left text-sm whitespace-nowrap transition-colors ${
                activeQuick === k ? 'bg-primary/15 text-primary' : 'text-muted hover:bg-surface-2 hover:text-text'
              }`}
            >
              {p.quick[k]}
            </button>
          ))}
        </div>

        <div className="flex flex-col p-4">
          {/* Месяцы */}
          <div className="flex gap-6">
            {months.map((m, mi) => (
              <div key={m.toISOString()} className="w-full sm:w-[252px]">
                <div className="mb-2 flex h-8 items-center justify-between">
                  {mi === 0 ? <NavBtn dir={-1} label={p.prevMonth} onClick={() => shift(-1)} /> : <span className="size-8" />}
                  <span className="text-sm font-semibold capitalize">
                    {monthName.format(m)} {m.getFullYear()}
                  </span>
                  {mi === months.length - 1 ? <NavBtn dir={1} label={p.nextMonth} onClick={() => shift(1)} /> : <span className="size-8" />}
                </div>
                <div className="grid grid-cols-7 text-center text-[11px] text-muted">
                  {p.weekdaysShort.map((w) => (
                    <span key={w} className="py-1">
                      {w}
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-7" onPointerLeave={() => setHover(null)}>
                  {monthGrid(m.getFullYear(), m.getMonth()).map((d) => {
                    const key = ymd(d)
                    if (d.getMonth() !== m.getMonth()) return <span key={key} className="h-9" />
                    const isStart = key === lo
                    const isEnd = key === hi
                    const inRange = !!lo && !!hi && key > lo && key < hi
                    const edge = isStart || isEnd
                    return (
                      <div key={key} className="relative h-9">
                        {/* полоса диапазона */}
                        {(inRange || (edge && lo !== hi)) && (
                          <span
                            aria-hidden
                            className={`absolute inset-y-0.5 bg-primary/15 ${isStart ? 'right-0 left-1/2' : isEnd ? 'right-1/2 left-0' : 'inset-x-0'}`}
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => pick(key)}
                          onPointerEnter={() => setHover(key)}
                          aria-label={fullDate.format(d)}
                          aria-pressed={edge}
                          className={`num relative mx-auto flex size-9 items-center justify-center rounded-full text-[13px] transition-colors ${
                            edge
                              ? 'bg-primary font-semibold text-on-primary shadow-glow'
                              : inRange
                                ? 'text-text hover:bg-primary/25'
                                : `hover:bg-surface-2 ${key > today ? 'text-muted/60' : 'text-text'}`
                          } ${key === today && !edge ? 'ring-1 ring-primary/60' : ''}`}
                        >
                          {d.getDate()}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Итог и кнопки */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
            <div className="text-sm">
              {shown ? (
                <>
                  <span className="font-medium">{formatRange(shown)}</span>
                  <span className="num ml-2 text-muted">{fmt(p.days, { n: daysInRange(shown) })}</span>
                  {!draft.to && <div className="text-xs text-muted">{p.hintEnd}</div>}
                </>
              ) : (
                <span className="text-muted">{p.hintStart}</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setDraft({ from: '', to: '' })} disabled={!draft.from}>
                {p.reset}
              </Button>
              <Button onClick={() => applied && onApply(applied)} disabled={!applied}>
                {p.apply}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function NavBtn({ dir, label, onClick }: { dir: 1 | -1; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-text">
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={dir < 0 ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
      </svg>
    </button>
  )
}
