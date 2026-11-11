/**
 * Тарифы (сетка ноября 2026). Оплаты на сайте пока нет — тариф выдаёт админ. Те же правила проверяет база (0016):
 * лимит сделок — plan_trade_limit, подключения — connection_plan_ok + plan_connection_limit (add_exchange_connection,
 * connection_active), скриншоты — plan_screenshot_limit, синхронизация на сервере — dispatch_sync (только Pro Plus).
 */
import type { Plan } from '@/types/db'

export type PlanInfo = {
  id: Plan
  /** $ в месяц при оплате помесячно, 0 — бесплатно */
  price: number
  /** $ за год (null — бесплатно) */
  priceYear: number | null
  /** сделок в месяц, null — без лимита */
  tradeLimit: number | null
  /** сколько подключений (бирж и кошельков вместе) */
  connections: number
  /** биржи и кошельки: Bybit по ключу, Hyperliquid по адресу */
  exchanges: boolean
  polymarket: boolean
  /** сделки подтягиваются на сервере каждые 3 часа, даже когда сайт закрыт */
  serverSync: boolean
  /** скриншотов на сделку */
  screenshots: number
  /** все палитры (иначе — 3 бесплатные) */
  allPalettes: boolean
  /** новые функции первыми */
  earlyAccess: boolean
}

export const PLANS: PlanInfo[] = [
  { id: 'free', price: 0, priceYear: null, tradeLimit: 50, connections: 0, exchanges: false, polymarket: false, serverSync: false, screenshots: 2, allPalettes: false, earlyAccess: false },
  { id: 'pro', price: 10, priceYear: 96, tradeLimit: null, connections: 1, exchanges: true, polymarket: false, serverSync: false, screenshots: 10, allPalettes: true, earlyAccess: false },
  { id: 'pro_plus', price: 15, priceYear: 144, tradeLimit: null, connections: 5, exchanges: true, polymarket: true, serverSync: true, screenshots: 10, allPalettes: true, earlyAccess: true },
]

/** Главный тариф — выделяется на странице тарифов и на главной */
export const MAIN_PLAN: Plan = 'pro_plus'

export const planInfo = (plan: Plan | undefined): PlanInfo => PLANS.find((p) => p.id === plan) ?? PLANS[0]

export type Billing = 'month' | 'year'

/** Цена в месяц: помесячно — как есть, при оплате за год — годовая / 12 */
export function monthlyPrice(p: PlanInfo, billing: Billing): number {
  return billing === 'year' && p.priceYear !== null ? p.priceYear / 12 : p.price
}

/** Скидка за год в процентах (Pro и Pro Plus — 20 %) */
export function yearDiscount(p: PlanInfo): number {
  return p.priceYear === null || p.price === 0 ? 0 : Math.round((1 - p.priceYear / (p.price * 12)) * 100)
}

/** Тип подключения разрешён на тарифе: Polymarket — только Pro Plus, биржи и кошельки — Pro и Pro Plus */
export function connectionTypeOk(exchange: string, plan: Plan | undefined): boolean {
  const p = planInfo(plan)
  return exchange === 'polymarket' ? p.polymarket : p.exchanges
}

/**
 * Можно ли добавить подключение: тип разрешён и не превышен лимит (count — сколько уже подключено, включая те, что на паузе).
 * Админ — без лимита (как в базе).
 */
export function canConnect(exchange: string, plan: Plan | undefined, count = 0, admin = false): boolean {
  if (admin) return true
  return connectionTypeOk(exchange, plan) && count < planInfo(plan).connections
}

/** Почему нельзя подключить: тип не на этом тарифе или лимит числа подключений; null — можно */
export function connectBlock(exchange: string, plan: Plan | undefined, count: number, admin = false): 'type' | 'limit' | null {
  if (admin) return null
  if (!connectionTypeOk(exchange, plan)) return 'type'
  if (count >= planInfo(plan).connections) return 'limit'
  return null
}

/** Самый дешёвый тариф, на котором доступен тип подключения */
export function planFor(exchange: string): Plan {
  return exchange === 'polymarket' ? 'pro_plus' : 'pro'
}

/**
 * Какие подключения работают на тарифе (как connection_ok в базе): тип разрешён и среди первых N по дате подключения.
 * Остальные не удаляются — стоят на паузе («нужен Pro Plus»).
 */
export function activeConnections<T extends { id: string; exchange: string; created_at: string }>(conns: T[], plan: Plan | undefined, admin = false): Set<string> {
  if (admin) return new Set(conns.map((c) => c.id))
  const limit = planInfo(plan).connections
  const ok = conns
    .filter((c) => connectionTypeOk(c.exchange, plan))
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .slice(0, limit)
  return new Set(ok.map((c) => c.id))
}

export const isPaid = (plan: Plan | undefined) => plan === 'pro' || plan === 'pro_plus'

const DAY = 86_400_000

/**
 * Срок тарифа для подписей: пробный Pro Plus или оплаченный тариф с датой окончания.
 * soon — пора показать плашку на дашборде: пробный — за 2 дня, обычный — за 3 дня.
 */
export type PlanTerm = { kind: 'trial' | 'paid'; plan: Plan; until: Date; daysLeft: number; soon: boolean }

export function planTerm(
  profile: { plan: Plan; plan_until: string | null; plan_trial?: boolean } | null | undefined,
  effective: Plan | undefined,
  now = Date.now(),
): PlanTerm | null {
  if (!profile || !profile.plan_until || !isPaid(profile.plan) || effective !== profile.plan) return null
  const until = new Date(profile.plan_until)
  const left = until.getTime() - now
  if (left <= 0) return null
  const daysLeft = Math.max(1, Math.ceil(left / DAY))
  const kind = profile.plan_trial ? 'trial' : 'paid'
  return { kind, plan: profile.plan, until, daysLeft, soon: daysLeft <= (kind === 'trial' ? 2 : 3) }
}
