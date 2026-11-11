/**
 * Язык интерфейса: английский (по умолчанию) или русский.
 * Выбор запоминается в этом браузере (localStorage), до загрузки приложения его ставит public/theme-init.js (<html lang>).
 * Здесь — только хранилище; тексты — src/i18n, форматы чисел и дат — src/lib/format.ts.
 */
export type Lang = 'en' | 'ru'
export const LANGS: readonly Lang[] = ['en', 'ru']
/** Язык, если человек ещё ничего не выбирал */
export const DEFAULT_LANG: Lang = 'en'
const KEY = 'cj-lang'

function read(): Lang {
  try {
    const v = globalThis.localStorage?.getItem(KEY)
    if (v === 'en' || v === 'ru') return v
  } catch {
    /* нет хранилища (приватный режим, тесты) */
  }
  return DEFAULT_LANG
}

let current: Lang = read()
const listeners = new Set<() => void>()

export function getLang(): Lang {
  return current
}

/** Сменить язык: запомнить, поправить <html lang>, перерисовать подписчиков */
export function setLang(lang: Lang): void {
  if (lang === current) return
  current = lang
  try {
    globalThis.localStorage?.setItem(KEY, lang)
  } catch {
    /* нет хранилища — язык просто не запомнится */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = lang
  listeners.forEach((f) => f())
}

export function subscribeLang(f: () => void): () => void {
  listeners.add(f)
  return () => listeners.delete(f)
}

/** Локаль для Intl (числа, даты): en-US / ru-RU */
export function intlLocale(lang: Lang = current): string {
  return lang === 'ru' ? 'ru-RU' : 'en-US'
}
