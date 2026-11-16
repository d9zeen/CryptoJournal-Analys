/**
 * Окошко фоновых загрузок в углу (вариант D, образец — 21st.dev google-drive-uploader-toast):
 * импорт файла и синхронизация биржи. Видно на любой странице дневника, пока что-то идёт, и ещё несколько секунд после.
 * Кольцо прогресса — stroke-dashoffset, галочка рисуется линией (CheckMark). Свернуть ⌄ / закрыть ✕ (закрыть — только когда всё готово).
 * Телефон — над нижним меню, во всю ширину с отступами; от 768px — справа внизу, 340px.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { fmt, plural, useT } from '@/i18n'
import { formatNumber } from '@/lib/format'
import { clearFinished, useActivities, type Activity } from '@/lib/activity'
import { CheckMark } from './CheckMark'

/** Через сколько закрыть окошко, когда всё загрузилось */
const HIDE_AFTER = 8000

export function ActivityToast() {
  const t = useT()
  const a = t.activity
  const items = useActivities()
  const [collapsed, setCollapsed] = useState(false)
  const running = items.filter((x) => x.status === 'running')
  const lastFinished = Math.max(0, ...items.map((x) => x.finishedAt ?? 0))

  // всё готово — само закроется через несколько секунд
  useEffect(() => {
    if (!items.length || running.length) return
    const id = window.setTimeout(clearFinished, Math.max(0, lastFinished + HIDE_AFTER - Date.now()))
    return () => window.clearTimeout(id)
  }, [items.length, running.length, lastFinished])

  if (!items.length) return null
  const inserted = items.reduce((s, x) => s + (x.inserted ?? 0), 0)

  return (
    <section
      data-activity
      aria-live="polite"
      aria-label={a.label}
      className="activity-toast fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 overflow-hidden rounded-xl border border-border bg-surface text-text shadow-2xl md:inset-x-auto md:right-6 md:bottom-6 md:w-[340px]"
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h2 className="truncate text-sm font-semibold">{running.length ? plural(running.length, a.running) : a.allDone}</h2>
        <span className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? a.expand : a.collapse}
            className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-text"
          >
            <svg viewBox="0 0 24 24" className={`size-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
              <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {!running.length && (
            <button type="button" onClick={clearFinished} aria-label={a.close} className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-text">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </span>
      </header>
      {!collapsed && (
        <>
          <ul className="flex flex-col">
            {items.map((x) => (
              <Row key={x.id} item={x} />
            ))}
          </ul>
          {!running.length && inserted > 0 && (
            <Link to="/trades" onClick={clearFinished} className="block border-t border-border px-4 py-2.5 text-sm font-medium text-primary hover:bg-surface-2/60">
              {a.toTrades} →
            </Link>
          )}
        </>
      )}
    </section>
  )
}

function Row({ item }: { item: Activity }) {
  const t = useT()
  const a = t.activity
  const sub =
    item.status === 'error'
      ? a.error
      : item.status === 'done'
        ? [item.inserted ? fmt(a.inserted, { n: formatNumber(item.inserted, 0) }) : a.nothingNew, item.duplicates ? fmt(a.duplicates, { n: formatNumber(item.duplicates, 0) }) : '']
            .filter(Boolean)
            .join(' · ')
        : item.done !== null && item.total
          ? fmt(plural(item.total, t.import.progress), { done: formatNumber(item.done, 0), total: formatNumber(item.total, 0) })
          : a.searching
  return (
    <li data-activity-item={item.kind} data-status={item.status} className="flex items-center gap-3 border-t border-border px-4 py-2.5 first:border-t-0">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-xs font-semibold text-muted" aria-hidden>
        {item.kind === 'file' ? 'CSV' : item.label.slice(0, 2)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{item.kind === 'sync' ? fmt(a.syncLabel, { name: item.label }) : item.label}</span>
        <span className={`block truncate text-xs ${item.status === 'error' ? 'text-loss' : 'text-muted'}`}>{sub}</span>
      </span>
      <Ring item={item} />
    </li>
  )
}

/** Кольцо: известен прогресс — заполняется; неизвестен — короткая дуга крутится; готово — галочка */
function Ring({ item }: { item: Activity }) {
  if (item.status === 'done') return <CheckMark className="size-5 shrink-0 text-up" />
  if (item.status === 'error')
    return (
      <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-loss" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden>
        <path d="M12 7v6M12 17h.01" strokeLinecap="round" />
      </svg>
    )
  const R = 9
  const len = 2 * Math.PI * R
  const share = item.done !== null && item.total ? Math.min(1, item.done / item.total) : null
  return (
    <svg viewBox="0 0 24 24" className={`size-6 shrink-0 ${share === null ? 'animate-spin' : ''}`} aria-hidden>
      <circle cx="12" cy="12" r={R} fill="none" stroke="var(--color-surface-2)" strokeWidth={3} />
      <circle
        transform="rotate(-90 12 12)"
        cx="12"
        cy="12"
        r={R}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray={len}
        strokeDashoffset={share === null ? len * 0.72 : len * (1 - share)}
        className="transition-[stroke-dashoffset] duration-500"
      />
    </svg>
  )
}
