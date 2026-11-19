import { applyPalette } from '@/lib/palette'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { queryClient } from '@/lib/queryClient'
import { getLang, subscribeLang } from '@/lib/locale'

type AuthState = {
  session: Session | null
  user: User | null
  /** гость демо-счёта (анонимный вход «Открыть демо», 0024): для главной и входа он «не вошёл», биржи / ссылки / скриншоты — нельзя */
  isGuest: boolean
  /** true, пока не узнали, залогинен ли пользователь */
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setLoading(false)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  // язык писем = язык сайта: шаблоны писем Supabase выбирают текст по user_metadata.lang (docs/email-templates).
  // Вошёл или сменил язык — запоминаем в аккаунте (одним запросом, только если отличается)
  const metaLang = session?.user?.user_metadata?.lang as string | undefined
  const userId = session?.user?.id
  useEffect(() => {
    if (!userId) return
    const sync = () => {
      const lang = getLang()
      if (lang !== metaLang) void supabase.auth.updateUser({ data: { lang } }).catch(() => undefined)
    }
    sync()
    return subscribeLang(sync)
  }, [userId, metaLang])

  const value: AuthState = {
    session,
    user: session?.user ?? null,
    isGuest: session?.user?.is_anonymous === true,
    loading,
    signOut: async () => {
      await supabase.auth.signOut()
      applyPalette('classic') // своя палитра — только внутри аккаунта
      queryClient.clear() // не оставляем чужие данные в памяти
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
