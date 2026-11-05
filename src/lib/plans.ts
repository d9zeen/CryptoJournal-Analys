/**
 * Тарифы. Оплаты пока нет — тариф выдаёт админ. Те же правила проверяет база (0013):
 * лимит сделок — plan_trade_limit, подключения — connection_plan_ok, синхронизация на сервере — dispatch_sync.
 */
import type { Plan } from '@/types/db'

export type PlanInfo = {
  id: Plan
  /** $ в месяц, 0 — бесплатно */
  price: number
  /** сделок в месяц, null — без лимита */
  tradeLimit: number | null
  polymarket: boolean
  /** биржи: ключи API (Bybit…) и кошельки DEX (Hyperliquid…) */
  exchanges: boolean
  /** сделки подтягиваются на сервере каждые 3 часа, даже когда сайт закрыт */
  serverSync: boolean
}

export const PLANS: PlanInfo[] = [
  { id: 'free', price: 0, tradeLimit: 30, polymarket: false, exchanges: false, serverSync: false },
  { id: 'pro', price: 10, tradeLimit: 50, polymarket: true, exchanges: false, serverSync: false },
  { id: 'pro_plus', price: 15, tradeLimit: null, polymarket: true, exchanges: true, serverSync: true },
]

export const planInfo = (plan: Plan | undefined): PlanInfo => PLANS.find((p) => p.id === plan) ?? PLANS[0]

/** Можно ли подключить биржу / кошелёк на этом тарифе */
export function canConnect(exchange: string, plan: Plan | undefined): boolean {
  const p = planInfo(plan)
  return exchange === 'polymarket' ? p.polymarket : p.exchanges
}

/** Самый дешёвый тариф, на котором доступно подключение */
export function planFor(exchange: string): Plan {
  return exchange === 'polymarket' ? 'pro' : 'pro_plus'
}

export const isPaid = (plan: Plan | undefined) => plan === 'pro' || plan === 'pro_plus'
