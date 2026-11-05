/** Вкладка «Календарь»: дни месяца, итог недели и месяца, листание месяцев */
import { test, expect, fakeSupabase, makeTrade } from './fixtures'

test('календарь прибыли: дни, итоги и листание месяцев', async ({ page, db }) => {
  const now = new Date()
  const day = (d: number, h: number) => new Date(now.getFullYear(), now.getMonth(), d, h).toISOString()
  db.trades = [
    makeTrade(1, { entry_at: day(2, 10), exit_at: day(2, 12), pnl: 120 }),
    makeTrade(2, { entry_at: day(2, 13), exit_at: day(2, 15), pnl: -20 }),
    makeTrade(3, { entry_at: day(3, 10), exit_at: day(3, 11), pnl: -50 }),
  ]
  await fakeSupabase(page, db)
  // на дашборде календаря больше нет — он в своей вкладке
  await page.goto('dashboard')
  await expect(page.getByText('Календарь прибыли')).toHaveCount(0)
  await page.getByRole('link', { name: 'Календарь' }).first().click()
  await expect(page).toHaveURL(/\/calendar$/)
  const cal = page.getByText('Календарь прибыли').locator('xpath=ancestor::div[contains(@class,"rise")][1]')
  await expect(cal).toBeVisible()
  const month = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(now)
  await expect(cal.getByText(month, { exact: false })).toBeVisible()
  // итог месяца: 3 сделки, 1 в плюс, +50 $
  await expect(cal.getByText('Сделки', { exact: true }).locator('..')).toContainText('3')
  await expect(cal.getByText('Винрейт', { exact: true }).locator('..')).toContainText('33')
  await expect(cal.getByText('Результат', { exact: true }).locator('..')).toContainText('+50')
  await cal.getByRole('button', { name: 'Следующий месяц' }).click()
  const next = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(new Date(now.getFullYear(), now.getMonth() + 1, 1))
  await expect(cal.getByText(next, { exact: false })).toBeVisible()
  await expect(cal.getByText('Сделки', { exact: true }).locator('..')).toContainText('0')
})
