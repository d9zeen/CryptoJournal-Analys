/**
 * Плашка монеты «логотип + тикер» (владелец 28.11.2026, образец — его скриншоты NEAR / VVV / HYPE: тёмная плашка, круглый логотип, жирный тикер;
 * «везде, где есть монета»): список сделок, страница сделки, «Разбор», календарь, «Статистика», импорт, кольцо «Портфеля».
 * Логотип — тот же, что в «Портфеле» (coins.icon из нашего Storage, у тикера — монета с большей капитализацией); монеты нет в базе — буквы.
 * Сделка Polymarket (есть title) — не монета: текст вопроса, как раньше.
 */
import { useMemo } from 'react'
import { baseCoin } from '@/lib/coin'
import { coinsBySymbol } from '@/lib/calc/portfolio'
import { useCoins } from './api'
import { CoinIcon } from './CoinIcon'

/** монеты по тикеру — один раз на всё приложение (кэш TanStack Query) */
export function useCoinMap() {
  const { data } = useCoins()
  return useMemo(() => coinsBySymbol(data ?? []), [data])
}

type Props = {
  /** тикер пары как в сделке: BTCUSDT, ETH-USDT-SWAP… */
  symbol: string
  /** вопрос Polymarket — тогда текст, а не плашка */
  title?: string | null
  /** xs — без подложки, в тесных строках (пары месяца в календаре); sm — в строках таблиц; md — в заголовках */
  size?: 'xs' | 'sm' | 'md'
  className?: string
}

export function CoinChip({ symbol, title, size = 'sm', className = '' }: Props) {
  const coins = useCoinMap()
  if (title) return <span className={`line-clamp-2 ${className}`}>{title}</span>
  const coin = baseCoin(symbol)
  const icon = coins.get(coin)?.icon ?? null
  const box = size === 'md' ? 'gap-2 rounded-md bg-surface-2 py-1 pr-2.5 pl-1 text-base' : size === 'sm' ? 'gap-1.5 rounded-md bg-surface-2 py-0.5 pr-2 pl-0.5 text-xs' : 'gap-1 text-xs'
  return (
    <span data-coin-chip={coin} title={symbol} className={`inline-flex max-w-full min-w-0 items-center align-middle font-semibold ${box} ${className}`}>
      <CoinIcon symbol={coin} icon={icon} size={size === 'md' ? 24 : size === 'sm' ? 18 : 14} />
      <span className="truncate">{coin}</span>
    </span>
  )
}
