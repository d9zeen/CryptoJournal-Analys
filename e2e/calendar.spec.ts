/** Календарь прибыли на дашборде: дни месяца, итог недели и месяца, листание месяцев */
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
  await page.goto('calendar')
  const cal = page.getByText('Календарь прибыли').locator('xpath=ancestor::div[contains(@class,"rise")][1]')
  await expect(cal).toBeVisible()
  // подпись месяца: «Ноябрь 2026» — с большой буквы и без «г.»
  const label = (d: Date) => {
    const s = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(d).replace(/\s*г\.?$/, '')
    return s.charAt(0).toUpperCase() + s.slice(1)
  }
  await expect(cal.getByText(label(now), { exact: true })).toBeVisible()
  // итог месяца: 3 сделки, 1 в плюс, +50 $
  // правая панель итогов (та же цифра есть и в строке «Итог месяца» под сеткой)
  const panel = cal.locator('aside')
  await expect(panel.getByText('Сделки', { exact: true }).locator('..')).toContainText('3')
  await expect(panel.getByText('Винрейт', { exact: true }).locator('..')).toContainText('33')
  await expect(panel.getByText('Результат', { exact: true }).locator('..')).toContainText('+50')
  await cal.getByRole('button', { name: 'Следующий месяц' }).click()
  await expect(cal.getByText(label(new Date(now.getFullYear(), now.getMonth() + 1, 1)), { exact: true })).toBeVisible()
  await expect(panel.getByText('Сделки', { exact: true }).locator('..')).toContainText('0')
})

test('календарь: только недели месяца и строка «Итог месяца» с max win / max loss', async ({ page, db }) => {
  const at = (d: number) => new Date(Date.UTC(2026, 9, d, 12)).toISOString() // октябрь 2026: 5 недель
  db.trades = [
    makeTrade(0, { pnl: 120, entry_at: at(5), exit_at: at(5) }),
    makeTrade(1, { pnl: -80, entry_at: at(6), exit_at: at(6) }),
    makeTrade(2, { pnl: 40, entry_at: at(20), exit_at: at(20) }),
  ]
  await page.clock.setFixedTime(new Date('2026-10-15T12:00:00Z'))
  await fakeSupabase(page, db)
  await page.goto('calendar')
  const total = page.locator('[data-shot="month-total"]')
  await expect(total.getByText('Итог месяца')).toBeVisible()
  await expect(total.getByText('+80,00 $')).toBeVisible()
  await expect(total.getByText('+120,00 $')).toBeVisible()
  await expect(total.getByText('−80,00 $')).toBeVisible()
})
