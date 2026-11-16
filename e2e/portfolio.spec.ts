// Вкладка «Портфель» (0019): балансы с биржи сами, иконки монет, сводка, график, доли, монета вручную, цена входа
import { test, expect, fakeSupabase, type FakeDb } from './fixtures'

const coin = (id: string, symbol: string, name: string, rank: number, price: number, change_24h: number, icon: string | null = `${id}.png`) => ({
  id, symbol, name, rank, price, change_24h, change_7d: 3, spark: Array.from({ length: 42 }, (_, i) => price * (1 + Math.sin(i / 6) / 50)), icon,
})
const COINS = [
  coin('bitcoin', 'BTC', 'Bitcoin', 1, 100000, 2),
  coin('ethereum', 'ETH', 'Ethereum', 2, 3000, -4),
  coin('tether', 'USDT', 'Tether', 3, 1, 0),
  coin('shiba-inu', 'SHIB', 'Shiba Inu', 20, 0.00001, 1, null),
]

function proPlus(db: FakeDb) {
  db.usage = { plan: 'pro_plus', trades_created: 3, trade_limit: null }
  db.coins = COINS
  db.connections = [
    { id: 'c1', exchange: 'bybit', label: 'Основной', api_key: 'AbCdEf123456', last_sync_at: new Date().toISOString(), cursor_at: null, last_error: null, key_expires_at: null, created_at: '2026-11-01T10:00:00Z' },
  ]
  const now = Date.now()
  db.snapshots = [
    { at: new Date(now - 6 * 86_400_000).toISOString(), total_usd: 28000, btc_price: 90000 },
    { at: new Date(now - 3 * 86_400_000).toISOString(), total_usd: 30500, btc_price: 95000 },
    { at: new Date(now - 2 * 3_600_000).toISOString(), total_usd: 31400, btc_price: 99000 },
  ]
}

test('портфель: балансы Bybit приходят сами, иконки, сводка, график, доли', async ({ page, db }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  proPlus(db)
  await fakeSupabase(page, db)
  await page.goto('portfolio')

  // открыли — балансы подтянулись с биржи по ключу «только чтение» и записались одной функцией
  await expect.poll(() => db.portfolioCalls?.find((c) => c.fn === 'replace_holdings')?.body).toMatchObject({
    p_connection: 'c1',
    p_items: expect.arrayContaining([
      { account: 'spot', symbol: 'BTC', amount: 0.25 },
      { account: 'spot', symbol: 'USDT', amount: 1200.5 },
      { account: 'fund', symbol: 'ETH', amount: 2 },
    ]),
  })
  expect(db.portfolioCalls?.some((c) => c.fn === 'portfolio_snapshot')).toBe(true)

  const table = page.locator('[data-portfolio-table]')
  await expect(table.locator('[data-coin="BTC"]')).toContainText('25 000,00 $')
  await expect(table.locator('[data-coin="BTC"]')).toContainText('Bybit')
  // иконка — с нашего Storage, а не с CoinGecko
  const icon = table.locator('[data-coin="BTC"] img')
  await expect(icon).toHaveAttribute('src', /\/storage\/v1\/object\/public\/coin-icons\/bitcoin\.png$/)
  await expect.poll(() => icon.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1)
  // мелочь (SHIB на 0,0001 $) скрыта, переключатель её показывает
  await expect(table.locator('[data-coin="SHIB"]')).toHaveCount(0)
  await page.getByRole('switch', { name: 'Скрыть мелочь до 1 $' }).uncheck({ force: true })
  await expect(table.locator('[data-coin="SHIB"]')).toBeVisible()

  // сводка: 25 000 + 6 000 + 1 200,5 = 32 200,50 $
  const kpis = page.locator('[data-portfolio-kpis]')
  await expect(kpis).toContainText('32 200,50 $')
  // прибыль: у USDT цена входа 1 $ (стейблкоин), у остальных — не указана
  await expect(kpis).toContainText('по цене входа у 1 из 4')

  // график (3 снимка + «сейчас») и кольцо долей
  await expect(page.locator('[data-portfolio-chart] .recharts-area')).toBeVisible()
  await expect(page.locator('[data-portfolio-alloc]')).toContainText('BTC')
  await expect(page.locator('[data-portfolio-alloc]')).toContainText('Хуже всех за 24 ч')

  // цена входа BTC руками → прибыль по BTC
  await table.locator('[data-coin="BTC"]').getByRole('button', { name: 'указать' }).click()
  await page.getByRole('textbox', { name: 'Средняя цена входа BTC, $' }).fill('80000')
  await table.locator('[data-coin="BTC"]').getByRole('button', { name: 'Сохранить' }).click()
  await expect.poll(() => db.costWrites?.[0]).toMatchObject({ method: 'POST', body: { symbol: 'BTC', avg_price: 80000 } })
  await expect(table.locator('[data-coin="BTC"]')).toContainText('+5 000,00 $')

  // страница не шире экрана
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440)
})

test('портфель на Basic: пусто → монета вручную', async ({ page, db }) => {
  db.coins = COINS
  await fakeSupabase(page, db)
  await page.goto('portfolio')
  const empty = page.locator('[data-portfolio-empty]')
  await expect(empty).toContainText('Портфель пока пустой')
  await expect(empty.locator('[data-upgrade]')).toBeVisible()

  await empty.getByRole('button', { name: 'Добавить монету' }).click()
  const dialog = page.locator('[data-add-coin]')
  await dialog.getByPlaceholder('BTC, Ethereum…').fill('eth')
  await dialog.getByRole('button', { name: /ETH/ }).click()
  await dialog.getByLabel('Количество').fill('1,5')
  await dialog.getByLabel('Где лежит (необязательно)').fill('Ledger')
  await dialog.getByRole('button', { name: 'Добавить', exact: true }).click()
  await expect.poll(() => db.holdings?.[0]).toMatchObject({ account: 'manual', symbol: 'ETH', amount: 1.5, note: 'Ledger' })
  // монета появилась (на телефоне — карточкой, на компьютере — строкой)
  await expect(page.locator('[data-coin="ETH"]')).toContainText('4 500,00 $')
  await expect(page.locator('[data-coin="ETH"]')).toContainText('Вручную')
})

test('портфель на телефоне: карточки монет, «Портфель» в нижнем меню', async ({ page, db, isMobile }) => {
  test.skip(!isMobile, 'только телефон')
  proPlus(db)
  await fakeSupabase(page, db)
  await page.goto('portfolio')
  await expect(page.locator('[data-portfolio-cards] [data-coin="BTC"]')).toContainText('25 000,00 $')
  await expect(page.locator('[data-portfolio-cards] [data-coin="BTC"] img')).toBeVisible()
  const nav = page.locator('nav.fixed')
  await expect(nav.getByRole('link')).toHaveCount(6)
  await expect(nav.getByRole('link', { name: 'Портфель' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
})
