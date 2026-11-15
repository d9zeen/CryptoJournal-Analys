/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** вид верхнего меню на время выбора (a / b / c) */
  readonly VITE_NAV_VARIANT?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
