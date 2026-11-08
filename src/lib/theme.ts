/**
 * Тема оформления: светлая (по умолчанию, решение владельца 07.11.2026) или тёмная.
 * На странице светлая — атрибут data-theme="light" на <html>; без атрибута — тёмная (базовые цвета theme.css).
 * Хранится в браузере (localStorage) — у каждого устройства своя, в базу не пишем.
 * Цвета обеих тем — в src/styles/theme.css.
 * До загрузки приложения тему ставит public/theme-init.js (иначе при светлой теме мигал бы тёмный фон) —
 * ключ и значения там те же, менять вместе.
 */
import { useSyncExternalStore } from 'react'

export type Theme = 'dark' | 'light'

// v2: 08.11.2026 сброшен старый выбор (у многих осталась «тёмная» с тех пор, когда она была по умолчанию) — все снова начинают со светлой
const KEY = 'cj-theme-v2'
const listeners = new Set<() => void>()

export function readTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light' // приватный режим / запрет хранилища
  }
}

/** Поставить тему на страницу (без сохранения) — вызывается до первой отрисовки в main.tsx */
export function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'light') root.dataset.theme = 'light'
  else delete root.dataset.theme
  // цвет панели браузера на телефоне — как фон страницы (--color-bg из theme.css)
  const bg = getComputedStyle(root).getPropertyValue('--color-bg').trim()
  if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg)
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // не сохранилось — тема всё равно сменится до перезагрузки
  }
  const root = document.documentElement
  const swap = () => applyTheme(theme)
  // плавная смена цветов, где браузер умеет: data-vt="theme" — мягкое растворение без сдвига (theme.css)
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (document.startViewTransition && !reduce) {
    root.dataset.vt = 'theme'
    document.startViewTransition(swap).finished.finally(() => delete root.dataset.vt)
  } else swap()
  listeners.forEach((l) => l())
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    readTheme,
  )
}
