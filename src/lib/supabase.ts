import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** true, если переменные окружения заданы. Иначе показываем экран «Supabase не подключён». */
export const isSupabaseConfigured = Boolean(url && key)

/**
 * Клиент Supabase. Использует ТОЛЬКО публичный ключ (anon / publishable).
 * Защита данных — на стороне базы (Row Level Security).
 */
export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(url!, key!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : (null as unknown as SupabaseClient)
