/**
 * Итоговый PnL при импорте. Биржи пишут PnL по-разному: одни уже за вычетом комиссий
 * (Bybit Closed P&L), другие — до комиссий (Binance «Realized Profit»). Определяем по тому,
 * к чему ближе число из файла: к валовому PnL или к PnL после комиссий.
 */
export function finalPnl(a: { gross: number; fee: number; funding: number; filePnl: number | null; sizeUsd: number }): {
  pnl: number
  pnlManual: boolean
} {
  const computed = a.gross - a.fee + a.funding
  if (a.filePnl === null) return { pnl: computed, pnlManual: false }
  const fileIsGross = a.fee > 0 && Math.abs(a.filePnl - a.gross) < Math.abs(a.filePnl - (a.gross - a.fee))
  const pnl = fileIsGross ? a.filePnl - a.fee + a.funding : a.filePnl
  // расхождение больше цента и 0,05% от размера — оставляем биржевой PnL и помечаем
  const pnlManual = Math.abs(pnl - computed) > Math.max(0.01, a.sizeUsd * 0.0005)
  return { pnl, pnlManual }
}
