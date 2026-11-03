/** Адреса сайта с учётом подпапки (на GitHub Pages сайт живёт в /CryptoJournal-Analys/). */

/** Подпапка для роутера: '/' или '/CryptoJournal-Analys' (без слэша в конце). */
export const BASENAME = import.meta.env.BASE_URL.replace(/\/+$/, '') || '/'

/** Полный адрес страницы сайта — для ссылок в письмах Supabase. appUrl('login') → https://…/CryptoJournal-Analys/login */
export function appUrl(path: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`
}
