/**
 * Фоновые загрузки — для окошка в углу (components/ActivityToast, образец 21st.dev google-drive-uploader-toast):
 * импорт файла и синхронизация биржи идут дальше, даже если человек ушёл на другую страницу.
 * Простое хранилище без библиотек: подписка через useSyncExternalStore.
 */
import { useSyncExternalStore } from 'react'

export type ActivityKind = 'file' | 'sync'

export type Activity = {
  id: string
  kind: ActivityKind
  /** имя файла или название биржи / подключения */
  label: string
  /** сколько записано из скольких (null — пока неизвестно: «ищем новые сделки…») */
  done: number | null
  total: number | null
  status: 'running' | 'done' | 'error'
  /** итог: сколько новых сделок */
  inserted?: number
  /** сколько уже было (дубли) */
  duplicates?: number
  finishedAt?: number
}

let items: Activity[] = []
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => void listeners.delete(cb)
}

function patch(id: string, p: Partial<Activity>) {
  items = items.map((a) => (a.id === id ? { ...a, ...p } : a))
  emit()
}

/** Начать загрузку (повторный id — заменяет прежнюю запись) */
export function startActivity(a: Omit<Activity, 'status' | 'done' | 'total'> & Partial<Pick<Activity, 'done' | 'total'>>) {
  items = [...items.filter((x) => x.id !== a.id), { done: null, total: null, ...a, status: 'running' }]
  emit()
}

export const progressActivity = (id: string, done: number, total: number) => patch(id, { done, total })

export function finishActivity(id: string, result: { inserted?: number; duplicates?: number; error?: boolean }) {
  patch(id, { status: result.error ? 'error' : 'done', inserted: result.inserted, duplicates: result.duplicates, finishedAt: Date.now() })
}

/** Убрать завершённые (кнопка ✕ или сами через несколько секунд) */
export function clearFinished() {
  items = items.filter((a) => a.status === 'running')
  emit()
}

export function useActivities(): Activity[] {
  return useSyncExternalStore(subscribe, () => items)
}

/** Для тестов */
export function resetActivities() {
  items = []
  emit()
}
