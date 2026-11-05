import { ru, type Dict } from './ru'

// Сейчас язык один. Когда появится en.ts — здесь будет выбор по настройке пользователя.
const dict: Dict = ru

/** Доступ к текстам: const t = useT(); t.auth.login.title */
export function useT(): Dict {
  return dict
}

/** Подстановка параметров: fmt('Привет, {name}', { name: 'Аня' }) */
export function fmt(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? `{${key}}`))
}

const pluralRules = new Intl.PluralRules('ru-RU')

/** Число со словом в нужной форме: plural(3, { one: '{n} сделка', few: '{n} сделки', many: '{n} сделок' }) */
export function plural(n: number, forms: { one: string; few: string; many: string }): string {
  const rule = pluralRules.select(n)
  const form = rule === 'one' ? forms.one : rule === 'few' ? forms.few : forms.many
  return fmt(form, { n })
}
