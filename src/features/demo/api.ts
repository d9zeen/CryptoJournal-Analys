/**
 * «Открыть демо» без регистрации (0024): гость = анонимный пользователь Supabase.
 * startDemo — вход гостем + демо-счёт (60 сделок из превью главной, депозит 5 000 $).
 * leaveDemo — гость решил завести свой аккаунт: демо-аккаунт удаляется сразу (не ждём ночной чистки), выход.
 */
import { supabase } from '@/lib/supabase'
import { queryClient } from '@/lib/queryClient'
import { getLang } from '@/lib/locale'
import { fetchCandles, type Candle } from '@/lib/candles'
import { demoAccount } from '@/features/landing/demo'
import { buildDemoRows, type Lists } from './seed'

const H = 3_600_000
/** Сколько ждём свечи (дальше — демо с примерными ценами, чтобы «за секунду» оставалось правдой) */
const CANDLES_TIMEOUT = 3500

/** Часовые свечи Bybit по символу за всё окно демо: кусками по 900 свечей (у Bybit до 1000 за раз) */
async function hourly(symbol: string, from: number, to: number): Promise<Candle[]> {
  const parts: Promise<Candle[]>[] = []
  for (let a = from; a < to; a += 900 * H) parts.push(fetchCandles('bybit', symbol, 'linear', '1h', a, Math.min(to, a + 900 * H)))
  return (await Promise.all(parts)).flat().sort((x, y) => x.t - y.t)
}

async function demoCandles(symbols: string[], from: number, to: number): Promise<Record<string, Candle[] | undefined>> {
  const load = Promise.all(symbols.map((s) => hourly(s, from, to).catch(() => undefined))).then((all) => Object.fromEntries(symbols.map((s, i) => [s, all[i]])))
  const timeout = new Promise<Record<string, Candle[] | undefined>>((resolve) => setTimeout(() => resolve({}), CANDLES_TIMEOUT))
  return Promise.race([load, timeout])
}

async function lists(): Promise<Lists> {
  const [s, m, e] = await Promise.all([
    supabase.from('setups').select('id, name'),
    supabase.from('mistake_tags').select('id, name'),
    supabase.from('emotions').select('id, name'),
  ])
  return { setups: s.data ?? [], mistakes: m.data ?? [], emotions: e.data ?? [] }
}

/** Демо-сделки уже есть (гость вернулся) — второй раз не кладём */
async function hasTrades(): Promise<boolean> {
  const { count } = await supabase.from('trades').select('id', { count: 'exact', head: true })
  return (count ?? 0) > 0
}

/** Положить демо-счёт текущему гостю */
export async function seedDemo(userId: string): Promise<void> {
  if (await hasTrades()) return
  const demo = demoAccount()
  const symbols = [...new Set(demo.trades.map((x) => x.symbol))]
  const from = Math.min(...demo.trades.map((x) => Date.parse(x.entry_at))) - H
  const to = Math.max(...demo.trades.map((x) => Date.parse(x.exit_at))) + H
  const [candles, l] = await Promise.all([demoCandles(symbols, from, to), lists()])
  const rows = buildDemoRows(demo.trades, l, candles, () => crypto.randomUUID())
  const { error } = await supabase.from('trades').insert(rows.trades)
  if (error) throw error
  if (rows.mistakes.length) {
    const { error: e2 } = await supabase.from('trade_mistakes').insert(rows.mistakes)
    if (e2) throw e2
  }
  // депозит — как в превью главной: «+48,5 % к депозиту»
  await supabase.from('profiles').update({ starting_balance: demo.balance }).eq('id', userId)
}

/** Войти гостем (или продолжить прежнее демо) и положить демо-счёт */
export async function startDemo(): Promise<void> {
  const { data: cur } = await supabase.auth.getSession()
  let user = cur.session?.user ?? null
  if (!user?.is_anonymous) {
    const { data, error } = await supabase.auth.signInAnonymously({
      options: { data: { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, lang: getLang() } },
    })
    if (error) throw error
    user = data.user
  }
  if (!user) throw new Error('NO_USER')
  await seedDemo(user.id)
  queryClient.clear()
}

/**
 * Выйти из демо: демо-аккаунт удаляется сразу, затем go() — переход (регистрация / главная), затем выход.
 * Порядок важен: если сначала выйти, страницы дневника сами уведут на «Вход» раньше нашего перехода.
 */
export async function leaveDemo(go: () => void): Promise<void> {
  await supabase.rpc('delete_my_account').then(
    () => undefined,
    () => undefined,
  )
  go()
  await supabase.auth.signOut({ scope: 'local' })
  queryClient.clear()
}
