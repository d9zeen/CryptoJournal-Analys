import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { deleteScreenshots } from '@/features/trades/screenshot'
import type { ImportedTrade } from '@/lib/import/types'

export type ImportRecord = {
  id: string
  exchange: string
  filename: string | null
  rows_total: number
  rows_imported: number
  rows_skipped: number
  created_at: string
}

const CHUNK = 500 // столько сделок отправляем одним запросом
const ID_CHUNK = 150 // столько id проверяем на дубли одним запросом (длина адреса запроса)
const PARALLEL = 6 // столько проверок дублей идут одновременно

const chunks = <T,>(arr: T[], size: number): T[][] => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, (i + 1) * size))

/** Какие из этих id сделок уже есть у пользователя на этой бирже. */
export async function fetchExistingIds(exchange: string, ids: string[]): Promise<Set<string>> {
  const found = new Set<string>()
  const parts = chunks([...new Set(ids)], ID_CHUNK)
  // по PARALLEL запросов одновременно: 30 000 сделок — секунды, а не минута
  for (let i = 0; i < parts.length; i += PARALLEL) {
    const results = await Promise.all(
      parts.slice(i, i + PARALLEL).map((part) => supabase.from('trades').select('external_id').eq('exchange', exchange).in('external_id', part)),
    )
    for (const { data, error } of results) {
      if (error) throw error
      for (const r of data as { external_id: string }[]) found.add(r.external_id)
    }
  }
  return found
}

/** История импортов, новые сверху */
export function useImports() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['imports', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase.from('imports').select('*').order('created_at', { ascending: false }).limit(50)
      if (error) throw error
      return data as ImportRecord[]
    },
  })
}

export type RunImportArgs = {
  exchange: string
  filename: string
  rowsTotal: number
  trades: ImportedTrade[]
}

export type RunImportResult = {
  importId: string
  inserted: number
  /** id, которые оказались дублями прямо во время вставки (например, импорт в двух вкладках) */
  duplicates: number
  /** ошибка, на которой остановились (например, FREE_LIMIT_REACHED); то, что успели, — сохранено */
  error: unknown | null
}

/**
 * Импорт: запись в журнал → сделки пачками по 100 → итоговые счётчики в журнал.
 * Если пачка упёрлась в дубль (кто-то успел раньше) — досылаем её по одной, пропуская дубли.
 * Лимит Free дополнительно проверяет триггер в базе: на нём останавливаемся.
 */
export async function runImport({ exchange, filename, rowsTotal, trades }: RunImportArgs): Promise<RunImportResult> {
  const { data: rec, error: recErr } = await supabase
    .from('imports')
    .insert({ exchange, filename: filename.slice(0, 200), rows_total: rowsTotal })
    .select('id')
    .single()
  if (recErr) throw recErr
  const importId = (rec as { id: string }).id

  const toRow = (t: ImportedTrade) => ({ ...t, id: crypto.randomUUID(), source: 'import' as const, import_id: importId })
  let inserted = 0
  let duplicates = 0
  let stopError: unknown = null

  outer: for (const part of chunks(trades, CHUNK)) {
    const { error } = await supabase.from('trades').insert(part.map(toRow))
    if (!error) {
      inserted += part.length
      continue
    }
    if (error.code !== '23505') {
      stopError = error
      break
    }
    for (const t of part) {
      const { error: oneErr } = await supabase.from('trades').insert(toRow(t))
      if (!oneErr) inserted++
      else if (oneErr.code === '23505') duplicates++
      else {
        stopError = oneErr
        break outer
      }
    }
  }

  await supabase
    .from('imports')
    .update({ rows_imported: inserted, rows_skipped: rowsTotal - inserted })
    .eq('id', importId)

  return { importId, inserted, duplicates, error: stopError }
}

export function useRunImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: runImport,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['trades'] })
      qc.invalidateQueries({ queryKey: ['usage'] })
      qc.invalidateQueries({ queryKey: ['imports'] })
    },
  })
}

/** Отменить импорт: удалить его сделки (и скриншоты, если успел добавить) и запись в журнале. Лимит не возвращается. */
export function useDeleteImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (importId: string) => {
      const { data: shots, error: shotErr } = await supabase
        .from('trades')
        .select('screenshot_path, trade_screenshots(path)')
        .eq('import_id', importId)
      if (shotErr) throw shotErr
      const paths = (shots as { screenshot_path: string | null; trade_screenshots: { path: string }[] }[]).flatMap((s) => [
        ...s.trade_screenshots.map((x) => x.path),
        ...(s.screenshot_path ? [s.screenshot_path] : []),
      ])
      const { error } = await supabase.from('trades').delete().eq('import_id', importId)
      if (error) throw error
      await deleteScreenshots([...new Set(paths)])
      const { error: recErr } = await supabase.from('imports').delete().eq('id', importId)
      if (recErr) throw recErr
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trades'] })
      qc.invalidateQueries({ queryKey: ['imports'] })
    },
  })
}
