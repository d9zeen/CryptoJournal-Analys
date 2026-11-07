/**
 * Палитра «плюса» и «минуса» — цвета прибыли и убытка по всему сайту (PnL, календарь, W / L).
 * По умолчанию 'classic' (зелёный и красный). Три палитры (FREE_PALETTES) — всем, остальные — Pro / Pro Plus (проверка и в базе, миграция 0015).
 * Сами цвета — в src/styles/theme.css (:root[data-palette='…'], для обеих тем); здесь только список и переключение.
 * Выбор хранится в профиле (profiles.palette) и копией в браузере — чтобы ставить его до первой отрисовки, без мигания.
 */
import type { Plan } from '@/types/db'

/** Порядок показа: сначала бесплатные, потом под замком до Pro */
export const PALETTES = ['classic', 'teal_salmon', 'sky_coral', 'cyan_wine', 'gold_indigo', 'emerald_ruby', 'aqua_tangerine', 'sage_terracotta'] as const
export type Palette = (typeof PALETTES)[number]

const KEY = 'cj-palette'

export const isPalette = (v: unknown): v is Palette => typeof v === 'string' && (PALETTES as readonly string[]).includes(v)

/** Доступны всем, в том числе на Basic (выбор владельца 07.11.2026); остальные — под замком до Pro */
export const FREE_PALETTES: readonly Palette[] = ['classic', 'teal_salmon', 'sky_coral']

const isPaid = (plan: Plan | undefined) => plan === 'pro' || plan === 'pro_plus'

/** Можно ли пользоваться палитрой на этом тарифе */
export const canUsePalette = (p: Palette, plan: Plan | undefined) => FREE_PALETTES.includes(p) || isPaid(plan)

export function readPalette(): Palette {
  try {
    const v = localStorage.getItem(KEY)
    return isPalette(v) ? v : 'classic'
  } catch {
    return 'classic'
  }
}

/** Поставить палитру на страницу и запомнить в браузере */
export function applyPalette(p: Palette) {
  const root = document.documentElement
  if (p === 'classic') delete root.dataset.palette
  else root.dataset.palette = p
  try {
    if (p === 'classic') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, p)
  } catch {
    // хранилище недоступно — палитра всё равно стоит до перезагрузки
  }
}
