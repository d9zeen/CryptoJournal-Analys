/** Типы строк базы данных (см. supabase/migrations). */
import type { MarketType, Side } from '@/lib/calc/trade'

export type Plan = 'free' | 'pro'
export type TradeSource = 'manual' | 'import'

export type Profile = {
  id: string
  display_name: string | null
  plan: Plan
  plan_until: string | null
  timezone: string
  starting_balance: number | null
  locale: 'ru' | 'en'
  created_at: string
  updated_at: string
}

export type ListKind = 'setups' | 'mistake_tags' | 'emotions'

export type ListItem = {
  id: string
  user_id: string
  name: string
  archived: boolean
  sort_order: number
  created_at: string
}

export type Trade = {
  id: string
  user_id: string
  exchange: string
  market_type: MarketType
  symbol: string
  side: Side
  entry_at: string
  exit_at: string | null
  entry_price: number
  exit_price: number | null
  size_usd: number
  leverage: number
  fee: number
  funding: number
  stop_loss: number | null
  take_profit: number | null
  pnl: number | null
  pnl_manual: boolean
  r_multiple: number | null
  setup_id: string | null
  emotion_id: string | null
  note: string | null
  screenshot_path: string | null
  source: TradeSource
  import_id: string | null
  external_id: string | null
  created_at: string
  updated_at: string
}

/** Скриншот сделки (их может быть несколько) */
export type TradeScreenshot = {
  id: string
  trade_id: string
  path: string
  sort_order: number
  created_at: string
}

/** Сделка вместе с id тегов ошибок и скриншотами */
export type TradeWithTags = Trade & { trade_mistakes: { tag_id: string }[]; trade_screenshots?: TradeScreenshot[] }

/** Поля, которые отправляем при создании/изменении */
export type TradeInput = Omit<Trade, 'user_id' | 'created_at' | 'updated_at' | 'source' | 'import_id' | 'external_id'>

export type Usage = {
  plan: Plan
  month: string
  trades_created: number
  trade_limit: number | null
}

/** Строка админки (функция admin_list_users) */
export type AdminUser = {
  id: string
  email: string | null
  created_at: string
  last_sign_in_at: string | null
  plan: Plan
  plan_until: string | null
  effective_plan: Plan
  trades_month: number
  trades_total: number
  is_admin: boolean
}
