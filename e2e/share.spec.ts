/** Ссылка «поделиться портфелем» (0022): создать в «Портфеле», открыть без входа — суммы скрыты, по умолчанию только доли */
import { test, expect, fakeSupabase } from './fixtures'

const coin = (id: string, symbol: string, rank: number, price: number) => ({ id, symbol, name: symbol, rank, price, change_24h: 2, change_7d: 3, spark: Array.from({ length: 42 }, (_, i) => price * (1 + i / 400)), icon: null })

test('поделиться: ссылка создаётся, по ней без входа видны доли, а не суммы', async ({ page, db, browser }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  db.coins = [coin('bitcoin', 'BTC', 1, 100000), coin('ethereum', 'ETH', 2, 3000)]
  db.holdings = [{ id: 'h1', connection_id: null, account: 'manual', symbol: 'BTC', amount: 0.5, value_usd: null, note: null, updated_at: new Date().toISOString() }]
  await fakeSupabase(page, db)
  await page.goto('portfolio')
  await page.getByRole('button', { name: 'Поделиться' }).click()
  const dialog = page.locator('[data-share-dialog]')
  await expect(dialog).toContainText('суммы скрыты')
  await dialog.getByRole('button', { name: 'Создать ссылку' }).click()
  const url = dialog.getByRole('textbox', { name: 'Ссылка на портфель' })
  await expect(url).toHaveValue(/\/p\/[0-9a-f]{32}$/)
  expect(db.portfolioCalls?.find((c) => c.fn === 'share_portfolio')?.body).toMatchObject({ p_show_amounts: false })
  const link = await url.inputValue()
  // суммы по умолчанию выключены; включаем — и выключаем обратно
  const amounts = dialog.getByRole('switch', { name: /Показывать суммы/ })
  await expect(amounts).not.toBeChecked()
  await amounts.check({ force: true })
  await expect.poll(() => db.share?.show_amounts).toBe(true)
  await amounts.uncheck({ force: true })
  await expect.poll(() => db.share?.show_amounts).toBe(false)
  await expect(url).toHaveValue(link) // ссылка та же

  // гость (без входа) открывает ссылку
  db.shared = {
    show_amounts: false,
    total: null,
    coins: [
      { symbol: 'BTC', name: 'Bitcoin', share: 0.8, change_24h: 2, spark: [1, 2, 3] },
      { symbol: 'ETH', name: 'Ethereum', share: 0.2, change_24h: -4, spark: [3, 2, 1] },
    ],
    history: [
      { t: new Date(Date.now() - 2 * 86_400_000).toISOString(), v: 100 },
      { t: new Date(Date.now() - 86_400_000).toISOString(), v: 104.5 },
    ],
  }
  const guest = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await guest.addInitScript(() => localStorage.setItem('cj-lang', 'ru'))
  await fakeSupabase(guest, db, { signedIn: false })
  await guest.goto(link)
  const main = guest.locator('[data-shared-portfolio]')
  await expect(main).toContainText('Суммы скрыты владельцем')
  await expect(main.locator('[data-coin="BTC"]')).toContainText('80')
  await expect(main).not.toContainText('$')
  await expect(main.locator('[data-shared-chart] .recharts-area')).toBeVisible()
  await expect(guest.getByRole('link', { name: 'Начать бесплатно' })).toBeVisible()
  expect(await guest.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)

  // владелец выключил ссылку — у гостя «ссылка не работает»
  await page.locator('[data-share-dialog]').getByRole('button', { name: 'Выключить ссылку' }).click()
  await expect.poll(() => db.share).toBeNull()
  await guest.reload()
  await expect(guest.locator('[data-shared-missing]')).toBeVisible()
  await guest.close()
})
