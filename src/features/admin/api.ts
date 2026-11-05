/** Админка: все запросы идут через функции базы, которые сами проверяют, что ты админ (миграция 0005). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import type { AdminUser, Plan } from '@/types/db'

/** Показывать ли пункт «Админка». Ошибка (например, миграция ещё не применена) — значит, не админ. */
export function useIsAdmin() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['isAdmin', user?.id],
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('is_admin')
      if (error) return false
      return data === true
    },
  })
}

export function useAdminUsers(enabled: boolean) {
  return useQuery({
    queryKey: ['adminUsers'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_list_users')
      if (error) throw error
      return (data ?? []) as AdminUser[]
    },
  })
}

function useAdminMutation<A>(run: (a: A) => Promise<void>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adminUsers'] })
      // если админ поменял тариф или лимит себе — обновить и свои данные
      qc.invalidateQueries({ queryKey: ['usage'] })
      qc.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}

export function useAdminSetPlan() {
  return useAdminMutation(async ({ userId, plan, until }: { userId: string; plan: Plan; until: string | null }) => {
    const { error } = await supabase.rpc('admin_set_plan', { p_user: userId, p_plan: plan, p_until: until })
    if (error) throw error
  })
}

export function useAdminResetUsage() {
  return useAdminMutation(async (userId: string) => {
    const { error } = await supabase.rpc('admin_reset_usage', { p_user: userId })
    if (error) throw error
  })
}
