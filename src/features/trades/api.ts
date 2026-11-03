import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import type { TradeInput, TradeScreenshot, TradeWithTags } from '@/types/db'
import { deleteScreenshots, uploadScreenshot } from './screenshot'

const SELECT = '*, trade_mistakes(tag_id), trade_screenshots(id, trade_id, path, sort_order, created_at)'

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
  /** скриншоты: добавить новые (сжатые картинки) и убрать сохранённые */
  screenshots?: { add: Blob[]; remove: TradeScreenshot[]; nextOrder: number }
}

export function useSaveTrade() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async ({ trade, tagIds, isNew, screenshots }: SaveTradeArgs) => {
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

      // 3. скриншоты: сначала убрать отмеченные, потом загрузить новые
      if (screenshots?.remove.length) {
        const { error: rmErr } = await supabase.from('trade_screenshots').delete().in('id', screenshots.remove.map((s) => s.id))
        if (rmErr) throw rmErr
        await deleteScreenshots(screenshots.remove.map((s) => s.path))
      }
      if (screenshots?.add.length) {
        const uploaded: string[] = []
        try {
          for (const blob of screenshots.add) uploaded.push(await uploadScreenshot(user!.id, trade.id, blob))
          const rows = uploaded.map((path, i) => ({ trade_id: trade.id, path, sort_order: screenshots.nextOrder + i }))
          const { error: insErr } = await supabase.from('trade_screenshots').insert(rows)
          if (insErr) throw insErr
        } catch (e) {
          await deleteScreenshots(uploaded) // не оставляем «осиротевшие» файлы
          throw e
        }
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
    mutationFn: async (trade: Pick<TradeWithTags, 'id' | 'screenshot_path' | 'trade_screenshots'>) => {
      const paths = (trade.trade_screenshots ?? []).map((s) => s.path)
      if (trade.screenshot_path && !paths.includes(trade.screenshot_path)) paths.push(trade.screenshot_path)
      const { error } = await supabase.from('trades').delete().eq('id', trade.id)
      if (error) throw error
      await deleteScreenshots(paths)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trades'] }),
  })
}
