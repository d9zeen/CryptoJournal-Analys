/**
 * Тема оформления: светлая (по умолчанию, решение владельца 06.11.2026) или тёмная.
 * Хранится в браузере (localStorage) — у каждого устройства своя, в базу не пишем.
 * Цвета обеих тем — в src/styles/theme.css.
 */
import { useSyncExternalStore } from 'react'

export type Theme = 'dark' | 'light'

const KEY = 'cj-theme'
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
  const swap = () => applyTheme(theme)
  // плавная смена цветов, где браузер умеет
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (document.startViewTransition && !reduce) document.startViewTransition(swap)
  else swap()
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
