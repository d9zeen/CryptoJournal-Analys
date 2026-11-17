/**
 * График сделки (17.11.2026): свечи биржи, вход / выход, MAE / MFE, эффективность выхода, таймфреймы, «Повтор»; только Pro Plus.
 * Свечи — фейковые (fixtures.ts: «пила» вокруг 100), на настоящие биржи тесты не ходят.
 */
import { expect, fakeSupabase, makeTrade, test } from './fixtures'

const trade = makeTrade(0, { side: 'long', entry_price: 100, exit_price: 101, stop_loss: 98, take_profit: 103, size_usd: 1000 })

test('Pro Plus: свечи своей биржи, вход и выход, MFE / MAE, эффективность', async ({ page, db }) => {
  db.usage = { plan: 'pro_plus', trades_created: 3, trade_limit: null }
  db.trades = [trade]
  await fakeSupabase(page, db)
  await page.goto(`trades/${trade.id}`)
  const chart = page.locator('[data-trade-chart]')
  await expect(chart.locator('[data-candle]').first()).toBeVisible()
  // сделка 4 часа → «Авто · 5м», свечи Bybit (биржа сделки)
  await expect(chart.locator('[data-interval="auto"]')).toContainText('5м')
  await expect(chart.locator('[data-chart-source="bybit"]')).toContainText('Bybit')
  expect(await chart.locator('[data-candle]').count()).toBeGreaterThan(50)
  await expect(chart.locator('[data-entry]')).toHaveCount(1)
  await expect(chart.locator('[data-exit]')).toHaveCount(1)
  await expect(chart.locator('[data-trade-band]')).toHaveCount(1)
  // ценники: вход, выход, стоп, тейк
  for (const k of ['entry', 'exit', 'stop', 'take']) await expect(chart.locator(`[data-pill="${k}"]`)).toHaveCount(1)
  // MFE в плюс, MAE в минус, в R — от стопа (риск 2)
  await expect(chart.locator('[data-metric="mfe"]')).toContainText('+')
  await expect(chart.locator('[data-metric="mae"]')).toContainText('−')
  await expect(chart.locator('[data-metric="mae"]')).toContainText('R')
  await expect(chart.locator('[data-efficiency]')).toContainText('%')
  await expect(chart.locator('[data-mark="mfe"]')).toHaveCount(1)
  // запросы только на чтение публичных свечей
  expect(db.candleCalls!.every((u) => u.startsWith('https://api.bybit.com/v5/market/kline?'))).toBe(true)

  // таймфрейм 1ч — новый запрос
  await chart.locator('[data-interval="1h"]').click()
  await expect(chart.locator('[data-interval="1h"]')).toHaveAttribute('aria-checked', 'true')
  await expect.poll(() => db.candleCalls!.some((u) => u.includes('interval=60'))).toBe(true)
  await expect(chart.locator('[data-chart-source]')).toContainText('1ч')

  // «Повтор»: свечи появляются заново и доходят до конца
  await chart.locator('[data-replay]').click()
  await expect(chart.locator('[data-replay="idle"]')).toBeVisible({ timeout: 15_000 })
  await expect(chart.locator('[data-exit]')).toHaveCount(1)
})

test('своя биржа не отвечает — свечи Binance, это написано под графиком', async ({ page, db }) => {
  db.usage = { plan: 'pro_plus', trades_created: 3, trade_limit: null }
  db.trades = [trade]
  db.candleHosts = ['fapi.binance.com']
  await fakeSupabase(page, db)
  await page.goto(`trades/${trade.id}`)
  await expect(page.locator('[data-chart-source="binance"]')).toContainText('Binance')
})

test('свечей нигде нет — понятный текст, без ошибок', async ({ page, db }) => {
  db.usage = { plan: 'pro_plus', trades_created: 3, trade_limit: null }
  db.trades = [trade]
  db.candleHosts = []
  await fakeSupabase(page, db)
  await page.goto(`trades/${trade.id}`)
  await expect(page.locator('[data-chart-none]')).toContainText('Binance, Bybit и OKX')
})

test('Basic / Pro: вместо графика — строка «в Pro Plus», к биржам не ходим; Polymarket — без блока', async ({ page, db }) => {
  db.usage = { plan: 'pro', trades_created: 3, trade_limit: null }
  const poly = makeTrade(1, { exchange: 'polymarket', market_type: 'prediction', symbol: 'X', title: 'Will it rain?' })
  db.trades = [trade, poly]
  await fakeSupabase(page, db)
  await page.goto(`trades/${trade.id}`)
  await expect(page.locator('[data-trade-chart] [data-upgrade]')).toContainText('Pro Plus')
  await page.goto(`trades/${poly.id}`)
  await expect(page.getByRole('heading', { name: /Will it rain/ })).toBeVisible()
  await expect(page.locator('[data-trade-chart]')).toHaveCount(0)
  expect(db.candleCalls ?? []).toEqual([])
})

test('телефон 390px: график по ширине экрана, без прокрутки вбок', async ({ page, db }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  db.usage = { plan: 'pro_plus', trades_created: 3, trade_limit: null }
  db.trades = [trade]
  await fakeSupabase(page, db)
  await page.goto(`trades/${trade.id}`)
  await expect(page.locator('[data-trade-chart] [data-candle]').first()).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
