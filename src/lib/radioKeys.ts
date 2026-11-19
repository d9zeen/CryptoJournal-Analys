import type { KeyboardEvent } from 'react'

/**
 * Стрелки в группе вариантов (role="radiogroup" с кнопками role="radio") или во вкладках (role="tablist" / role="tab"), как положено по ARIA:
 * ← / ↑ — предыдущий, → / ↓ — следующий (по кругу), Home / End — первый / последний.
 * Фокус переходит на кнопку и сразу выбирает её (click). Вешать на контейнер: onKeyDown={radioKeys}.
 * Пара к нему — tabIndex={checked ? 0 : -1} у кнопок: Tab заходит в группу один раз, на выбранный вариант.
 */
export function radioKeys(e: KeyboardEvent<HTMLElement>) {
  const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key]
  if (step === undefined && e.key !== 'Home' && e.key !== 'End') return
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]:not([disabled]), [role="tab"]:not([disabled])')]
  if (!items.length) return
  const cur = items.indexOf(document.activeElement as HTMLElement)
  const next =
    e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (Math.max(cur, 0) + (step ?? 0) + items.length) % items.length
  e.preventDefault()
  items[next].focus()
  items[next].click()
}
