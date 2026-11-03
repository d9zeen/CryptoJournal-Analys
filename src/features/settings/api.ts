import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import type { ListItem, ListKind, Profile, Usage } from '@/types/db'

export function useProfile() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['profile', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').single()
      if (error) throw error
      return data as Profile
    },
  })
}

export type ProfilePatch = Partial<Pick<Profile, 'display_name' | 'timezone' | 'starting_balance'>>

export function useUpdateProfile() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (patch: ProfilePatch) => {
      const { error } = await supabase.from('profiles').update(patch).eq('id', user!.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile'] }),
  })
}

export function useUsage() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['usage', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_usage').single()
      if (error) throw error
      return data as Usage
    },
  })
}

/** Сетапы / теги ошибок / эмоции */
export function useList(kind: ListKind) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['list', kind, user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase.from(kind).select('*').order('sort_order').order('created_at')
      if (error) throw error
      return data as ListItem[]
    },
  })
}

export function useListMutations(kind: ListKind) {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['list', kind] })

  const add = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from(kind)
        .insert({ name: name.trim(), sort_order: 1000 })
        .select()
        .single()
      if (error) throw error
      return data as ListItem
    },
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; name?: string; archived?: boolean }) => {
      const { error } = await supabase.from(kind).update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(kind).delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidate()
      qc.invalidateQueries({ queryKey: ['trades'] })
    },
  })

  return { add, update, remove }
}
