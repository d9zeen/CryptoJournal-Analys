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
