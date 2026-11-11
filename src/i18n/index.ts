import { useSyncExternalStore } from 'react'
import { ru, type Dict } from './ru'
import { en } from './en'
import { getLang, setLang, subscribeLang, type Lang } from '@/lib/locale'

const dicts: Record<Lang, Dict> = { en, ru }

/** Текущий язык; компонент перерисуется при смене */
export function useLang(): Lang {
  return useSyncExternalStore(subscribeLang, getLang, getLang)
}

export { setLang, type Lang }

/** Доступ к текстам: const t = useT(); t.auth.login.title */
export function useT(): Dict {
  return dicts[useLang()]
}

/** Тексты вне компонентов (например, в обработчиках) — по текущему языку */
export function getT(): Dict {
  return dicts[getLang()]
}

/** Подстановка параметров: fmt('Привет, {name}', { name: 'Аня' }) */
export function fmt(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? `{${key}}`))
}

const pluralRules: Record<Lang, Intl.PluralRules> = { en: new Intl.PluralRules('en-US'), ru: new Intl.PluralRules('ru-RU') }

/**
 * Число со словом в нужной форме: plural(3, { one: '{n} сделка', few: '{n} сделки', many: '{n} сделок' }).
 * В английском форм две: one (1 trade) и many (2 trades); few там равна many.
 */
export function plural(n: number, forms: { one: string; few: string; many: string }): string {
  const rule = pluralRules[getLang()].select(n)
  const form = rule === 'one' ? forms.one : rule === 'few' ? forms.few : forms.many
  return fmt(form, { n })
}
