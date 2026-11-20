/**
 * Портфель демо-счёта гостя (владелец, 20.11.2026: «заходишь на демо, а портфель пустой»).
 * Монеты — известные всем (BTC, ETH, SOL, HYPE…), количество подобрано по НЫНЕШНИМ ценам из таблицы coins,
 * чтобы портфель был около 12 500 $; цена входа у каждой своя — часть монет в плюсе, часть в минусе.
 * Пишется как обычные «монеты вручную» (holdings, account = manual) — их можно менять и удалять, как свои.
 * История стоимости (снимки пишет только база) — выдуманная кривая в браузере (demoSnapshots): последние 7 дней — по настоящим
 * мини-графикам монет (estimateHistory), раньше — плавное случайное блуждание, одинаковое при каждом открытии.
 */
import type { Coin, EstimatePoint, Snapshot } from '@/lib/calc/portfolio'

/** Состав: доля в долларах и цена входа как доля нынешней цены (меньше 1 — в плюсе, больше — в минусе) */
export const DEMO_PORTFOLIO: { symbol: string; share: number; cost?: number }[] = [
  { symbol: 'BTC', share: 0.36, cost: 0.78 },
  { symbol: 'ETH', share: 0.17, cost: 1.08 },
  { symbol: 'SOL', share: 0.1, cost: 0.86 },
  { symbol: 'HYPE', share: 0.09, cost: 0.52 },
  { symbol: 'BNB', share: 0.05, cost: 0.93 },
  { symbol: 'XRP', share: 0.04, cost: 0.71 },
  { symbol: 'LINK', share: 0.035, cost: 1.17 },
  { symbol: 'SUI', share: 0.03, cost: 1.32 },
  { symbol: 'DOGE', share: 0.02, cost: 0.84 },
  { symbol: 'TON', share: 0.015, cost: 1.45 },
  // стейблкоин — «сухой порох»; цена входа у стейблкоинов и так 1 $
  { symbol: 'USDT', share: 0.07 },
]

/** Примерная стоимость демо-портфеля, $ */
export const DEMO_PORTFOLIO_USD = 12_480

/** Количество: 4 значащие цифры (0,1834 BTC; 1 245 DOGE) */
function roundAmount(x: number): number {
  if (x <= 0 || !Number.isFinite(x)) return 0
  const digits = 4 - Math.ceil(Math.log10(x))
  return digits > 0 ? Number(x.toFixed(Math.min(digits, 8))) : Math.round(x / 10 ** -digits) * 10 ** -digits
}

/** Цена входа: значащих цифр хватает и для BTC, и для DOGE */
function roundPrice(p: number): number {
  const digits = Math.max(2, 5 - Math.floor(Math.log10(p)))
  return Number(p.toFixed(Math.min(digits, 8)))
}

/** Цена по символу — у монеты с большей капитализацией (как в расчётах портфеля) */
function priceOf(coins: Coin[], symbol: string): number | null {
  const c = coins
    .filter((x) => x.symbol === symbol && x.price !== null && x.price > 0)
    .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))[0]
  return c ? Number(c.price) : symbol === 'USDT' ? 1 : null
}

/**
 * Строки для вставки: монеты вручную и цены входа. Монеты без цены в таблице coins пропускаются
 * (их доля не теряется — остальные слегка крупнее), чтобы в демо не было «цены нет».
 */
export function buildDemoPortfolio(coins: Coin[], totalUsd = DEMO_PORTFOLIO_USD) {
  const priced = DEMO_PORTFOLIO.map((x) => ({ ...x, price: priceOf(coins, x.symbol) })).filter((x): x is typeof x & { price: number } => x.price !== null)
  const shareSum = priced.reduce((s, x) => s + x.share, 0) || 1
  const holdings = priced
    .map((x) => ({ account: 'manual' as const, symbol: x.symbol, amount: roundAmount(((x.share / shareSum) * totalUsd) / x.price), note: null }))
    .filter((h) => h.amount > 0)
  const costs = priced.filter((x) => x.cost !== undefined).map((x) => ({ symbol: x.symbol, avg_price: roundPrice(x.price * x.cost!) }))
  return { holdings, costs }
}

/** Предсказуемый генератор случайных чисел (одна и та же кривая при каждом открытии) */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DAY = 86_400_000
/** Сколько дней истории у демо-портфеля */
export const DEMO_HISTORY_DAYS = 180

/**
 * Выдуманные снимки стоимости демо-портфеля: точка каждые 6 часов за 180 дней.
 * estimate — оценка последних 7 дней по мини-графикам монет (estimateHistory): она остаётся как есть, а более ранняя часть
 * «отматывается» от её первой точки назад случайным блужданием с лёгким ростом (портфель в итоге в плюсе), без скачков на стыке.
 * Нет оценки — блуждание заканчивается нынешней стоимостью. Цена BTC для линии «если бы всё было в BTC» — так же.
 */
export function demoSnapshots(estimate: EstimatePoint[], nowMs: number, totalNow: number, btcNow: number | null): Snapshot[] {
  if (!(totalNow > 0)) return []
  const step = 6 * 3_600_000
  const startT = estimate.length ? estimate[0].t : nowMs
  let value = estimate.length ? estimate[0].value : totalNow
  let btc = (estimate.length ? estimate[0].btcPrice : btcNow) ?? null
  const rand = rng(20261120)
  const back: Snapshot[] = []
  for (let t = startT - step; t >= nowMs - DEMO_HISTORY_DAYS * DAY; t -= step) {
    // шаг назад: в среднем портфель рос (значит, раньше был ниже), колебания ~1,4 % за 6 часов
    const shock = (rand() - 0.5) * 0.028 + (rand() - 0.5) * 0.012
    value = value / (1 + 0.0012 + shock)
    if (btc !== null) btc = btc / (1 + 0.0009 + shock * 0.8 + (rand() - 0.5) * 0.008)
    back.push({ at: new Date(t).toISOString(), total_usd: Math.round(value * 100) / 100, btc_price: btc === null ? null : Math.round(btc * 100) / 100 })
  }
  const recent: Snapshot[] = estimate.map((e) => ({ at: new Date(e.t).toISOString(), total_usd: Math.round(e.value * 100) / 100, btc_price: e.btcPrice }))
  return [...back.reverse(), ...recent]
}
