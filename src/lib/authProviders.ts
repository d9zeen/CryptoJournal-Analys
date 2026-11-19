/**
 * Вход в один клик (19.11.2026, план docs/LAUNCH_PLAN.md п. 2.2). Кнопка появляется, только когда провайдер включён в Supabase:
 * иначе Supabase ответит «provider is not enabled». Включает владелец (docs/AUTH_GOOGLE.md), затем VITE_AUTH_GOOGLE=1 в .github/workflows/pages.yml.
 */
export const GOOGLE_LOGIN = import.meta.env.VITE_AUTH_GOOGLE === '1'
