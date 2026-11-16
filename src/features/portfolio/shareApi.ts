/**
 * Ссылка «поделиться портфелем» (0022): одна на человека, только просмотр, без входа.
 * По умолчанию суммы скрыты (доли и проценты); показать суммы — переключатель в окне «Поделиться».
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { appUrl } from '@/lib/url'

export type Share = { token: string; show_amounts: boolean }

/** Адрес публичной страницы портфеля */
export const shareUrl = (token: string) => appUrl(`p/${token}`)

export function useShare() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['portfolio_share', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase.from('portfolio_shares').select('token, show_amounts').maybeSingle()
      if (error) throw error
      return (data ?? null) as Share | null
    },
  })
}

/** Включить ссылку / поменять «показывать суммы» / выдать новую ссылку (renew) */
export function useSetShare() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { showAmounts: boolean; renew?: boolean }) => {
      const { data, error } = await supabase.rpc('share_portfolio', { p_show_amounts: v.showAmounts, p_new_token: Boolean(v.renew) })
      if (error) throw error
      return data as string
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portfolio_share'] }),
  })
}

export function useUnshare() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('unshare_portfolio')
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portfolio_share'] }),
  })
}

/** Портфель по ссылке — для всех, без входа (shared_portfolio отдаёт только разрешённое владельцем) */
export type SharedCoin = {
  symbol: string
  name?: string
  icon?: string
  color?: string
  share: number
  change_24h?: number
  change_7d?: number
  spark?: number[]
  value?: number
}
export type SharedPortfolio = { show_amounts: boolean; total: number | null; coins: SharedCoin[]; history: { t: string; v: number }[] }

export function useSharedPortfolio(token: string | undefined) {
  return useQuery({
    queryKey: ['shared_portfolio', token],
    enabled: Boolean(token),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('shared_portfolio', { p_token: token })
      if (error) throw error
      return (data ?? null) as SharedPortfolio | null
    },
  })
}
