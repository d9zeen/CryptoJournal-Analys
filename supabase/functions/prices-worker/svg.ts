/**
 * Логотипы монет в SVG (TradingView): проверка перед тем, как положить файл в наш Storage, и цвет монеты из логотипа.
 * SVG может содержать скрипт — в <img> он не выполняется, но файл лежит на домене Supabase и его можно открыть напрямую.
 * Поэтому пропускаем только «рисунок»: без скриптов, обработчиков, внешних ссылок, вложенных картинок и сущностей.
 */

const BAD = [
  /<script/i,
  /<foreignObject/i,
  /<iframe|<object|<embed|<image|<audio|<video|<animate|<set\b/i,
  /\bon[a-z]+\s*=/i, // onload=, onclick=…
  /javascript:/i,
  /<!ENTITY|<!DOCTYPE|<\?xml-stylesheet/i,
  /@import/i,
  /\bhref\s*=\s*["']\s*(?!#)/i, // ссылки — только внутрь файла (#градиент)
  /url\(\s*["']?\s*(?!#)/i, // url(…) — только url(#id)
]

/** Безопасный SVG как есть, иначе null */
export function safeSvg(text: string): string | null {
  const t = text.trim()
  if (!t || t.length > 200_000) return null
  // TradingView начинает файл с комментария <!-- by TradingView -->
  if (!/^(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(t)) return null
  if (BAD.some((re) => re.test(t))) return null
  return t
}

function hex6(raw: string): string | null {
  const h = raw.replace('#', '').toLowerCase()
  if (/^[0-9a-f]{3}$/.test(h)) return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`
  return /^[0-9a-f]{6}$/.test(h) ? `#${h}` : null
}

function hsl(hex: string): { s: number; l: number } {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const s = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min)
  return { s, l }
}

/**
 * Цвет монеты: самый частый «цветной» цвет логотипа (fill / stroke / stop-color).
 * Почти белый и почти чёрный (фон и буква) не берём; насыщенные цвета важнее серых.
 */
export function svgColor(svg: string): string | null {
  const score = new Map<string, number>()
  for (const m of svg.matchAll(/(?:fill|stroke|stop-color)\s*[:=]\s*["']?\s*(#[0-9a-fA-F]{3,6})\b/g)) {
    const c = hex6(m[1])
    if (!c) continue
    const { s, l } = hsl(c)
    if (l < 0.18 || l > 0.93) continue
    score.set(c, (score.get(c) ?? 0) + (s > 0.25 ? 3 : 1))
  }
  let best: string | null = null
  let top = 0
  for (const [c, v] of score) if (v > top) [best, top] = [c, v]
  return best
}

/** Строка рейтинга монет TradingView (scanner.tradingview.com/coin/scan): тикер, название, id логотипа, место */
export type TvCoin = { symbol: string; name: string; logoid: string; rank: number }

const LOGOID = /^crypto\/[A-Za-z0-9_-]{1,40}$/
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Ответ сканера TradingView → список монет (мусор отбрасываем) */
export function parseTvScan(body: unknown): TvCoin[] {
  const data = (body as { data?: unknown } | null)?.data
  if (!Array.isArray(data)) return []
  const out: TvCoin[] = []
  for (const row of data) {
    const d = (row as { d?: unknown } | null)?.d
    if (!Array.isArray(d)) continue
    const [symbol, name, logoid, rank] = d
    if (typeof symbol !== 'string' || typeof logoid !== 'string' || !LOGOID.test(logoid)) continue
    out.push({ symbol: symbol.toUpperCase(), name: typeof name === 'string' ? name : '', logoid, rank: typeof rank === 'number' ? rank : Infinity })
  }
  return out
}

/**
 * id логотипа TradingView для нашей монеты: тот же тикер и, если таких несколько, — то же название
 * (у TradingView под тикером HYPE есть и чужая монета, а Hyperliquid — XTVCHYPEH). Не нашли — null (будет картинка CoinGecko).
 */
export function pickLogoId(list: TvCoin[], symbol: string, name: string): string | null {
  const same = list.filter((c) => c.symbol === symbol)
  if (!same.length) return null
  const byName = same.find((c) => norm(c.name) === norm(name)) ?? same.find((c) => norm(c.name).includes(norm(name)) || norm(name).includes(norm(c.name)))
  if (byName) return byName.logoid
  // названия не совпали: берём единственного кандидата, только если он в рейтинге высоко (иначе это, скорее всего, другая монета)
  return same.length === 1 && same[0].rank <= 300 ? same[0].logoid : null
}

/** Адрес логотипа у TradingView по id логотипа (crypto/XTVCBTC) */
export const tradingViewLogo = (logoid: string) => `https://s3-symbol-logo.tradingview.com/${logoid}.svg`
