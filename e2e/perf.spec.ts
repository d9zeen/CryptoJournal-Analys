/**
 * Много сделок: всё учитывается (Supabase отдаёт не больше 1000 строк за запрос — догружаем пачками),
 * а страница не раздувается (список рисуется по 100, графики прорежены).
 */
import { test, expect, fakeSupabase, makeTrade } from './fixtures'

const many = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    makeTrade(i, {
      entry_at: new Date(Date.UTC(2024, 0, 1) + i * 3_600_000 * 7).toISOString(),
      exit_at: new Date(Date.UTC(2024, 0, 1) + i * 3_600_000 * 7 + 3_600_000).toISOString(),
    }),
  )

test('5000 сделок: дашборд считает все, график укрупнён, страница лёгкая', async ({ page, db }) => {
  db.trades = many(5000)
  await fakeSupabase(page, db)
  await page.goto('dashboard')
  await expect(page.getByText('сделок: 5000').first()).toBeVisible()
  await expect(page.getByText(/PnL по (неделям|месяцам)/)).toBeVisible()
  await page.waitForLoadState('networkidle')
  expect(await page.evaluate(() => document.querySelectorAll('*').length)).toBeLessThan(3000)
})

test('5000 сделок: список показывает все по 100 и догружает', async ({ page, db }) => {
  db.trades = many(5000)
  await fakeSupabase(page, db)
  await page.goto('trades')
  await expect(page.getByText('Сделок: 5000')).toBeVisible()
  expect(await page.evaluate(() => document.querySelectorAll('*').length)).toBeLessThan(3000)
  await page.getByRole('button', { name: 'Показать ещё 100 (осталось 4900)' }).click()
  await expect(page.getByRole('button', { name: 'Показать ещё 100 (осталось 4800)' })).toBeVisible()
})

test('5000 сделок: сортировка по PnL и быстрый фильтр — без подвисаний, по 100 на экране', async ({ page, db, isMobile }) => {
  test.skip(isMobile, 'сортировка заголовком — на компьютере')
  db.trades = many(5000)
  await fakeSupabase(page, db)
  await page.goto('trades')
  await expect(page.getByText('Сделок: 5000')).toBeVisible()
  // время от клика до перерисовки (сортировка и фильтр — по уже загруженным сделкам, без запросов к базе)
  const timed = async (act: () => Promise<void>, until: () => Promise<void>) => {
    const t0 = Date.now()
    await act()
    await until()
    return Date.now() - t0
  }
  const sortMs = await timed(
    () => page.getByRole('button', { name: 'Сортировать: PnL' }).click(),
    () => expect(page.locator('th[aria-sort="descending"]')).toContainText('PnL'),
  )
  const filterMs = await timed(
    () => page.getByRole('button', { name: 'Long', exact: true }).click(),
    () => expect(page.getByText('Сделок: 2500')).toBeVisible(),
  )
  expect(sortMs, 'сортировка 5000 сделок').toBeLessThan(1500)
  expect(filterMs, 'фильтр 5000 сделок').toBeLessThan(1500)
  // на экране по-прежнему порция из 100 строк
  await expect(page.locator('tbody tr')).toHaveCount(100)
  expect(await page.evaluate(() => document.querySelectorAll('*').length)).toBeLessThan(3500)
})
