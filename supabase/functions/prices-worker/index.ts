/**
 * prices-worker — цены и иконки монет для вкладки «Портфель» (0019).
 *
 * Кто вызывает: только база (pg_cron cj-prices каждые 10 минут → public.dispatch_prices → pg_net) с секретом
 * cj_sync_secret из Vault в заголовке x-sync-secret. Из браузера вызвать нельзя: без секрета — 403 (verify_jwt = false).
 *
 * Что делает:
 *  1. Топ-500 монет CoinGecko (две страницы /coins/markets): цена, изменение за 24 ч и 7 дней, мини-график за 7 дней →
 *     таблица coins (upsert по id; иконку не трогает).
 *  2. Иконки: до 40 монет за запуск, у которых иконки ещё нет, — скачивает картинку CoinGecko и кладёт в наш Storage
 *     (bucket coin-icons). Сайт показывает иконки с нашего Supabase: CSP не трогаем, CoinGecko не видит, у кого какие монеты.
 *     Только PNG / JPEG / WebP до 200 КБ (SVG не берём — в нём может быть скрипт).
 *
 * Ключ CoinGecko необязателен: если в Vault есть cj_coingecko_key (Demo), он уходит в заголовке x-cg-demo-api-key.
 * Выкладка: Supabase → Edge Functions → prices-worker (index.ts), verify_jwt = false.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CG = 'https://api.coingecko.com/api/v3'
const PAGES = 2
const ICONS_PER_RUN = 40
const ICON_MAX = 200 * 1024
const ICON_HOSTS = ['coin-images.coingecko.com', 'assets.coingecko.com']
const ICON_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

type Market = {
  id?: unknown
  symbol?: unknown
  name?: unknown
  image?: unknown
  market_cap_rank?: unknown
  current_price?: unknown
  price_change_percentage_24h?: unknown
  price_change_percentage_24h_in_currency?: unknown
  price_change_percentage_7d_in_currency?: unknown
  sparkline_in_7d?: { price?: unknown }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
/** 6 значащих цифр — для мини-графика хватает, а строка короче */
const sig = (v: number) => Number(v.toPrecision(6))

/** Ответ CoinGecko → строка таблицы coins (мусор — null) */
function toCoin(m: Market) {
  const id = typeof m.id === 'string' ? m.id : ''
  const symbol = typeof m.symbol === 'string' ? m.symbol.toUpperCase() : ''
  if (!/^[a-z0-9-]{1,80}$/.test(id) || !/^[A-Z0-9._-]{1,24}$/.test(symbol)) return null
  const prices = Array.isArray(m.sparkline_in_7d?.price) ? (m.sparkline_in_7d!.price as unknown[]).map(num).filter((x): x is number => x !== null) : []
  // 168 часовых точек → 42 (каждая четвёртая) — мини-график в таблице
  const spark = prices.filter((_, i) => i % 4 === 0 || i === prices.length - 1).map(sig)
  let image: string | null = null
  if (typeof m.image === 'string') {
    try {
      const u = new URL(m.image)
      if (u.protocol === 'https:' && ICON_HOSTS.includes(u.hostname)) image = u.toString()
    } catch {
      /* не адрес */
    }
  }
  return {
    id,
    symbol,
    name: (typeof m.name === 'string' ? m.name : symbol).slice(0, 100),
    rank: num(m.market_cap_rank),
    price: num(m.current_price),
    change_24h: num(m.price_change_percentage_24h_in_currency) ?? num(m.price_change_percentage_24h),
    change_7d: num(m.price_change_percentage_7d_in_currency),
    spark: spark.length ? spark : null,
    image_src: image,
    updated_at: new Date().toISOString(),
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'METHOD' }, 405)
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  const { data: ok } = await admin.rpc('sync_secret_ok', { p_secret: req.headers.get('x-sync-secret') ?? '' })
  if (ok !== true) return json({ error: 'FORBIDDEN' }, 403)

  const { data: key } = await admin.rpc('coingecko_key')
  const headers: Record<string, string> = { accept: 'application/json' }
  if (typeof key === 'string' && key) headers['x-cg-demo-api-key'] = key

  // 1. Цены. У монет, которые уже есть, адрес иконки не перезаписываем: неподходящую картинку сервер помечает
  // (image_src = null) и больше её не качает
  const { data: have } = await admin.from('coins').select('id')
  const known = new Set(((have ?? []) as { id: string }[]).map((r) => r.id))
  let saved = 0
  for (let page = 1; page <= PAGES; page++) {
    const q = new URLSearchParams({
      vs_currency: 'usd',
      order: 'market_cap_desc',
      per_page: '250',
      page: String(page),
      sparkline: 'true',
      price_change_percentage: '24h,7d',
    })
    const res = await fetch(`${CG}/coins/markets?${q}`, { headers })
    if (!res.ok) return json({ error: 'COINGECKO_HTTP', status: res.status, saved }, 502)
    const list = (await res.json().catch(() => null)) as Market[] | null
    if (!Array.isArray(list)) return json({ error: 'COINGECKO_BODY', saved }, 502)
    const rows = list.map(toCoin).filter((r): r is NonNullable<typeof r> => r !== null)
    const fresh = rows.filter((r) => !known.has(r.id))
    const update = rows.filter((r) => known.has(r.id)).map(({ image_src: _skip, ...r }) => r)
    for (const part of [fresh, update]) {
      if (!part.length) continue
      const { error } = await admin.from('coins').upsert(part, { onConflict: 'id' })
      if (error) return json({ error: 'DB', message: error.message, saved }, 500)
    }
    saved += rows.length
  }

  // 2. Иконки, которых ещё нет
  const { data: todo } = await admin
    .from('coins')
    .select('id, image_src')
    .is('icon', null)
    .not('image_src', 'is', null)
    .order('rank', { ascending: true, nullsFirst: false })
    .limit(ICONS_PER_RUN)
  let icons = 0
  for (const c of (todo ?? []) as { id: string; image_src: string }[]) {
    try {
      if (!ICON_HOSTS.includes(new URL(c.image_src).hostname)) continue
      const res = await fetch(c.image_src)
      const type = (res.headers.get('content-type') ?? '').split(';')[0].trim()
      const ext = ICON_TYPES[type]
      // неподходящая картинка (SVG, слишком большая, нет файла) — больше не пробуем, на сайте будет буква-значок
      const skip = () => admin.from('coins').update({ image_src: null }).eq('id', c.id)
      if (!res.ok || !ext) {
        await skip()
        continue
      }
      const bytes = new Uint8Array(await res.arrayBuffer())
      if (bytes.byteLength === 0 || bytes.byteLength > ICON_MAX) {
        await skip()
        continue
      }
      const file = `${c.id}.${ext}`
      const { error: upErr } = await admin.storage.from('coin-icons').upload(file, bytes, { contentType: type, upsert: true, cacheControl: '604800' })
      if (upErr) continue
      await admin.from('coins').update({ icon: file }).eq('id', c.id)
      icons++
    } catch {
      /* одна иконка не скачалась — возьмём в следующий раз */
    }
  }

  return json({ coins: saved, icons })
})
