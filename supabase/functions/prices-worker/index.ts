/**
 * prices-worker — цены, иконки и цвета монет для вкладки «Портфель» (0019). Работает само, без открытого сайта.
 *
 * Кто вызывает: только база (pg_cron cj-prices каждые 10 минут → public.dispatch_prices → pg_net) с секретом
 * cj_sync_secret из Vault в заголовке x-sync-secret. Из браузера вызвать нельзя: без секрета — 403 (verify_jwt = false).
 *
 * Что делает за один запуск:
 *  1. Цены (CoinGecko /coins/markets): топ-500 + монеты, которые кто-то держит, но они не в топе (held_coin_ids).
 *  2. Новые монеты: символы, которые держат, а монеты в coins нет (held_missing_symbols), — ищет у CoinGecko (/search),
 *     берёт только ранжированную монету с точно таким символом (мусорные токены не подхватит); не нашёл — coin_misses (сутки не ищем).
 *  3. Иконки (до 100 за запуск): логотип TradingView (SVG, после проверки safeSvg) → наш Storage coin-icons; цвет монеты — из логотипа.
 *     Какой логотип — по рейтингу монет TradingView (сканер coin/scan): тот же тикер и то же название (тикеры у них повторяются).
 *     Нет логотипа у TradingView — картинка CoinGecko (PNG / JPEG / WebP). Браузер иконки берёт только с нашего Supabase:
 *     CSP не трогаем, сторонние сайты не узнают, у кого какие монеты.
 *
 *  Стейблкоины, которые держат привязку (±0,5 %), — ровно 1 $ (platforms.ts → pegged): без «убытка −10 $» на USDT по 0,9992 $.
 *  4. Адреса контрактов монет по сетям (0021, coins.platforms) — раз в сутки или когда появились новые монеты:
 *     по ним «Портфель» читает балансы кошельков EVM / Solana только у настоящих монет (platforms.ts).
 *
 * Ключ CoinGecko необязателен: если в Vault есть cj_coingecko_key (Demo), он уходит в заголовке x-cg-demo-api-key.
 * Выкладка: Supabase → Edge Functions → prices-worker (index.ts + svg.ts + platforms.ts), verify_jwt = false.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { parseTvScan, pickLogoId, safeSvg, svgColor, tradingViewLogo, type TvCoin } from './svg.ts'
import { pegged, pickPlatforms } from './platforms.ts'

const CG = 'https://api.coingecko.com/api/v3'
const PAGES = 2
const SEARCH_PER_RUN = 3
const ICONS_PER_RUN = 100
const ICON_MAX = 200 * 1024
const ICON_HOSTS = ['coin-images.coingecko.com', 'assets.coingecko.com']
const RASTER: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

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
  const row = rawCoin(m)
  return row ? pegged(row) : null
}
function rawCoin(m: Market) {
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
type CoinRow = NonNullable<ReturnType<typeof rawCoin>>

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'METHOD' }, 405)
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  const { data: ok } = await admin.rpc('sync_secret_ok', { p_secret: req.headers.get('x-sync-secret') ?? '' })
  if (ok !== true) return json({ error: 'FORBIDDEN' }, 403)

  const { data: key } = await admin.rpc('coingecko_key')
  const headers: Record<string, string> = { accept: 'application/json' }
  if (typeof key === 'string' && key) headers['x-cg-demo-api-key'] = key
  const cg = async (path: string, params: Record<string, string>) => {
    const res = await fetch(`${CG}${path}?${new URLSearchParams(params)}`, { headers })
    if (!res.ok) throw new Error(`COINGECKO_HTTP_${res.status}`)
    return res.json()
  }
  const marketParams = { vs_currency: 'usd', sparkline: 'true', price_change_percentage: '24h,7d' }

  // монеты, которые уже есть: адрес запасной иконки не перезаписываем (он мог смениться — не страшно)
  const { data: have } = await admin.from('coins').select('id')
  const known = new Set(((have ?? []) as { id: string }[]).map((r) => r.id))
  const save = async (rows: CoinRow[]) => {
    const fresh = rows.filter((r) => !known.has(r.id))
    const update = rows.filter((r) => known.has(r.id)).map(({ image_src: _skip, ...r }) => r)
    for (const part of [fresh, update]) {
      if (!part.length) continue
      const { error } = await admin.from('coins').upsert(part, { onConflict: 'id' })
      if (error) throw new Error(`DB ${error.message}`)
    }
    for (const r of rows) known.add(r.id)
  }

  const report = { coins: 0, held: 0, found: 0, missed: 0, icons: 0, platforms: 0, errors: [] as string[] }

  // 1. Топ-500
  const seen = new Set<string>()
  try {
    for (let page = 1; page <= PAGES; page++) {
      const list = (await cg('/coins/markets', { ...marketParams, order: 'market_cap_desc', per_page: '250', page: String(page) })) as Market[]
      const rows = (Array.isArray(list) ? list : []).map(toCoin).filter((r): r is CoinRow => r !== null)
      await save(rows)
      rows.forEach((r) => seen.add(r.id))
      report.coins += rows.length
    }
  } catch (e) {
    report.errors.push(String(e))
  }

  // 2. Держимые монеты не из топа + новые монеты по символу
  try {
    const { data: heldIds } = await admin.rpc('held_coin_ids')
    const ids = new Set(((heldIds ?? []) as string[]).filter((id) => !seen.has(id)))
    const { data: missing } = await admin.rpc('held_missing_symbols', { p_limit: SEARCH_PER_RUN })
    for (const sym of (missing ?? []) as string[]) {
      const r = (await cg('/search', { query: sym })) as { coins?: { id?: unknown; symbol?: unknown; market_cap_rank?: unknown }[] }
      const match = (r.coins ?? [])
        .filter((c) => typeof c.id === 'string' && String(c.symbol).toUpperCase() === sym && num(c.market_cap_rank) !== null)
        .sort((a, b) => num(a.market_cap_rank)! - num(b.market_cap_rank)!)[0]
      if (match) {
        ids.add(match.id as string)
        report.found++
      } else {
        await admin.from('coin_misses').upsert({ symbol: sym, checked_at: new Date().toISOString() })
        report.missed++
      }
    }
    const all = [...ids].filter((id) => /^[a-z0-9-]{1,80}$/.test(id))
    for (let i = 0; i < all.length; i += 250) {
      const list = (await cg('/coins/markets', { ...marketParams, ids: all.slice(i, i + 250).join(',') })) as Market[]
      const rows = (Array.isArray(list) ? list : []).map(toCoin).filter((r): r is CoinRow => r !== null)
      await save(rows)
      report.held += rows.length
    }
  } catch (e) {
    report.errors.push(String(e))
  }

  // 3. Иконки и цвета: сначала TradingView (SVG), иначе CoinGecko
  const { data: todo } = await admin
    .from('coins')
    .select('id, symbol, name, image_src')
    .is('icon', null)
    .or(`icon_checked_at.is.null,icon_checked_at.lt.${new Date(Date.now() - 7 * 86_400_000).toISOString()}`)
    .order('rank', { ascending: true, nullsFirst: false })
    .limit(ICONS_PER_RUN)
  // рейтинг монет TradingView (тикер, название, id логотипа) — один запрос, только если есть монеты без иконки
  let tvList: TvCoin[] = []
  if (todo?.length) {
    try {
      const res = await fetch('https://scanner.tradingview.com/coin/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          columns: ['base_currency', 'base_currency_desc', 'base_currency_logoid', 'crypto_total_rank'],
          sort: { sortBy: 'crypto_total_rank', sortOrder: 'asc' },
          range: [0, 1500],
        }),
      })
      if (res.ok) tvList = parseTvScan(await res.json())
    } catch {
      /* TradingView не ответил — возьмём картинки CoinGecko */
    }
  }
  for (const c of (todo ?? []) as { id: string; symbol: string; name: string; image_src: string | null }[]) {
    try {
      let file: string | null = null
      let color: string | null = null
      const logoid = pickLogoId(tvList, c.symbol, c.name)
      const tv = logoid ? await fetch(tradingViewLogo(logoid)) : null
      // S3 у TradingView может отдать SVG с типом binary/octet-stream — решаем по содержимому (safeSvg)
      const svg = tv?.ok ? safeSvg(await tv.text()) : null
      if (svg && svg.length <= ICON_MAX) {
        file = `${c.id}.svg`
        color = svgColor(svg)
        const { error } = await admin.storage.from('coin-icons').upload(file, new TextEncoder().encode(svg), { contentType: 'image/svg+xml', upsert: true, cacheControl: '604800' })
        if (error) file = null
      }
      if (!file && c.image_src && ICON_HOSTS.includes(new URL(c.image_src).hostname)) {
        const res = await fetch(c.image_src)
        const type = (res.headers.get('content-type') ?? '').split(';')[0].trim()
        const bytes = res.ok && RASTER[type] ? new Uint8Array(await res.arrayBuffer()) : null
        if (bytes && bytes.byteLength > 0 && bytes.byteLength <= ICON_MAX) {
          const name = `${c.id}.${RASTER[type]}`
          const { error } = await admin.storage.from('coin-icons').upload(name, bytes, { contentType: type, upsert: true, cacheControl: '604800' })
          if (!error) file = name
        }
      }
      if (file) {
        await admin.from('coins').update({ icon: file, color }).eq('id', c.id)
        report.icons++
      } else {
        // ни у TradingView, ни у CoinGecko нет подходящей картинки — на сайте буквы, снова пробуем через неделю
        await admin.from('coins').update({ icon_checked_at: new Date().toISOString() }).eq('id', c.id)
      }
    } catch {
      /* одна иконка не скачалась — возьмём в следующий раз */
    }
  }

  // 4. Адреса контрактов: раз в сутки (около 03:00 UTC) или если у монет их ещё нет. Один большой запрос (~3 МБ)
  try {
    const { data: rows } = await admin.from('coins').select('id, symbol, name, platforms')
    const list = (rows ?? []) as { id: string; symbol: string; name: string; platforms: unknown }[]
    const hour = new Date()
    const daily = hour.getUTCHours() === 3 && hour.getUTCMinutes() < 10
    if (list.length && (daily || list.some((r) => r.platforms === null))) {
      const all = await cg('/coins/list', { include_platform: 'true' })
      const picked = pickPlatforms(all, list.map((r) => r.id))
      const upd = list.map((r) => ({ id: r.id, symbol: r.symbol, name: r.name, platforms: picked.get(r.id) ?? {} }))
      for (let i = 0; i < upd.length; i += 500) {
        const { error } = await admin.from('coins').upsert(upd.slice(i, i + 500), { onConflict: 'id' })
        if (error) throw new Error(`DB ${error.message}`)
      }
      report.platforms = upd.length
    }
  } catch (e) {
    report.errors.push(String(e))
  }

  return json(report, report.errors.length && !report.coins ? 502 : 200)
})
