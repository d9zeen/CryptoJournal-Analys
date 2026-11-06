/**
 * ВРЕМЕННО: варианты оформления для показа владельцу (localStorage «cj-v-<блок>» = a | b | c | d).
 * После выбора владельцем — оставить выбранный вариант в коде и удалить этот файл.
 */
export function previewVariant(key: string): string {
  try {
    return localStorage.getItem(`cj-v-${key}`) ?? 'a'
  } catch {
    return 'a'
  }
}
