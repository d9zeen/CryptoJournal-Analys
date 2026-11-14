/** Заметки дня в календаре (таблица day_notes, 0017): одна на день; записать — только Pro Plus (проверка и здесь, и триггером в базе). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import type { DayNote } from '@/types/db'

/** Наибольшая длина заметки (то же ограничение — check в базе) */
export const NOTE_MAX = 2000

export function useDayNote(day: string | null) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['dayNote', user?.id, day],
    enabled: Boolean(user && day),
    queryFn: async () => {
      const { data, error } = await supabase.from('day_notes').select('*').eq('day', day!).maybeSingle()
      if (error) throw error
      return (data as DayNote | null) ?? null
    },
  })
}

/** Сохранить заметку дня: пустой текст — удалить заметку */
export function useSaveDayNote() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async ({ day, text }: { day: string; text: string }) => {
      const clean = text.trim()
      if (!clean) {
        const { error } = await supabase.from('day_notes').delete().eq('day', day)
        if (error) throw error
        return null
      }
      const { data, error } = await supabase
        .from('day_notes')
        .upsert({ day, text: clean.slice(0, NOTE_MAX) }, { onConflict: 'user_id,day' })
        .select()
        .single()
      if (error) throw error
      return data as DayNote
    },
    onSuccess: (note, { day }) => qc.setQueryData(['dayNote', user?.id, day], note),
  })
}

/** Все заметки пользователя — для выгрузки в CSV (заметок немного: одна на день) */
export async function fetchAllNotes(): Promise<DayNote[]> {
  const all: DayNote[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('day_notes').select('*').order('day').range(from, from + 999)
    if (error) throw error
    all.push(...(data as DayNote[]))
    if (data.length < 1000) return all
  }
}
