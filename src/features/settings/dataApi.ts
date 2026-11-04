/** Резервная копия сделок (CSV) и удаление аккаунта. */
import { supabase } from '@/lib/supabase'
import { queryClient } from '@/lib/queryClient'
import { exportFilename, tradesToCsv } from '@/lib/export/tradesCsv'
import type { ListItem, TradeWithTags } from '@/types/db'
import { fetchTradesPaged } from '@/features/trades/api'

const PAGE = 1000

/** Все сделки пользователя — постранично, без лимита на количество. */
export function fetchAllTrades(): Promise<TradeWithTags[]> {
  return fetchTradesPaged({ from: null, to: null }, true)
}

async function fetchNames(kind: 'setups' | 'emotions' | 'mistake_tags'): Promise<Map<string, string>> {
  const { data, error } = await supabase.from(kind).select('id, name')
  if (error) throw error
  return new Map((data as Pick<ListItem, 'id' | 'name'>[]).map((x) => [x.id, x.name]))
}

/** Скачать все сделки одним CSV-файлом. Возвращает число выгруженных сделок. */
export async function downloadTradesCsv(): Promise<number> {
  const [trades, setups, emotions, tags] = await Promise.all([fetchAllTrades(), fetchNames('setups'), fetchNames('emotions'), fetchNames('mistake_tags')])
  const csv = tradesToCsv(trades, { setups, emotions, tags })
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = exportFilename()
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return trades.length
}

const BUCKET = 'screenshots'

/** Все файлы в папке хранилища, включая вложенные ({user_id}/ и {user_id}/{trade_id}/). */
async function listFilesDeep(folder: string): Promise<string[]> {
  const paths: string[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.storage.from(BUCKET).list(folder, { limit: PAGE, offset })
    if (error) throw error
    for (const f of data) {
      // у папок id = null
      if (f.id === null) paths.push(...(await listFilesDeep(`${folder}/${f.name}`)))
      else paths.push(`${folder}/${f.name}`)
    }
    if (data.length < PAGE) return paths
  }
}

/**
 * Удалить аккаунт навсегда: сначала скриншоты (через Storage API — SQL их удалить не может),
 * затем пользователя (функция delete_my_account, всё остальное удаляется каскадом в базе).
 */
export async function deleteMyAccount(userId: string): Promise<void> {
  const paths = await listFilesDeep(userId)
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 100))
    if (error) throw error
  }
  const { error } = await supabase.rpc('delete_my_account')
  if (error) throw error
  // Пользователя на сервере больше нет — выходим только локально и чистим кэш
  await supabase.auth.signOut({ scope: 'local' })
  queryClient.clear()
}
