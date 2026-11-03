import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import type { TradeInput, TradeWithTags } from '@/types/db'
import { deleteScreenshot, uploadScreenshot } from './screenshot'

const SELECT = '*, trade_mistakes(tag_id)'

export type DateRange = { from: string | null; to: string | null }

/** Сделки за период (по дате входа). Остальные фильтры — на клиенте. */
export function useTrades(range: DateRange) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['trades', user?.id, range.from, range.to],
    enabled: Boolean(user),
    queryFn: async () => {
      let q = supabase.from('trades').select(SELECT).order('entry_at', { ascending: false }).limit(5000)
      if (range.from) q = q.gte('entry_at', range.from)
      if (range.to) q = q.lt('entry_at', range.to)
      const { data, error } = await q
      if (error) throw error
      return data as TradeWithTags[]
    },
  })
}

export function useTrade(id: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['trade', id],
    enabled: Boolean(user && id),
    queryFn: async () => {
      const { data, error } = await supabase.from('trades').select(SELECT).eq('id', id!).maybeSingle()
      if (error) throw error
      return data as TradeWithTags | null
    },
  })
}

export type SaveTradeArgs = {
  trade: TradeInput
  tagIds: string[]
  isNew: boolean
  /** новый скриншот (Blob), null — удалить текущий, undefined — не трогать */
  screenshot?: Blob | null
}

export function useSaveTrade() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async ({ trade, tagIds, isNew, screenshot }: SaveTradeArgs) => {
      // 1. сама сделка
      const { error } = isNew
        ? await supabase.from('trades').insert(trade)
        : await supabase.from('trades').update(trade).eq('id', trade.id)
      if (error) throw error

      // 2. теги ошибок: убираем снятые, добавляем новые
      if (!isNew) {
        let del = supabase.from('trade_mistakes').delete().eq('trade_id', trade.id)
        if (tagIds.length) del = del.not('tag_id', 'in', `(${tagIds.join(',')})`)
        const { error: delErr } = await del
        if (delErr) throw delErr
      }
      if (tagIds.length) {
        const rows = tagIds.map((tag_id) => ({ trade_id: trade.id, tag_id }))
        const { error: tagErr } = await supabase.from('trade_mistakes').upsert(rows, { ignoreDuplicates: true })
        if (tagErr) throw tagErr
      }

      // 3. скриншот
      if (screenshot === null && trade.screenshot_path) {
        await deleteScreenshot(trade.screenshot_path)
        await supabase.from('trades').update({ screenshot_path: null }).eq('id', trade.id)
      } else if (screenshot) {
        if (trade.screenshot_path) await deleteScreenshot(trade.screenshot_path)
        const path = await uploadScreenshot(user!.id, trade.id, screenshot)
        const { error: pathErr } = await supabase.from('trades').update({ screenshot_path: path }).eq('id', trade.id)
        if (pathErr) throw pathErr
      }
      return trade.id
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['trades'] })
      qc.invalidateQueries({ queryKey: ['trade', id] })
      qc.invalidateQueries({ queryKey: ['usage'] })
    },
  })
}

export function useDeleteTrade() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (trade: { id: string; screenshot_path: string | null }) => {
      const { error } = await supabase.from('trades').delete().eq('id', trade.id)
      if (error) throw error
      if (trade.screenshot_path) await deleteScreenshot(trade.screenshot_path)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trades'] }),
  })
}
