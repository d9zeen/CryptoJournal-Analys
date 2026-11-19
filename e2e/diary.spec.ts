// Главная → «Как выглядит дневник изнутри» (features/landing/DiaryTabs.tsx): вкладки над одним окном, снимок — по теме, языку и ширине
import { test, expect, fakeSupabase } from './fixtures'

test('вкладки переключают снимок, стрелки работают, снимок — своей темы и ширины', async ({ page, db, isMobile }) => {
  await fakeSupabase(page, db, { signedIn: false })
  await page.goto('')
  const block = page.locator('[data-diary]')
  await block.scrollIntoViewIfNeeded()
  const tabs = block.getByRole('tab')
  await expect(tabs).toHaveText(['Запись сделки', 'Список сделок', 'Разбор', 'График сделки'])
  const shot = block.locator('[data-diary-shot]')
  const device = isMobile ? 'phone' : 'desk'
  await expect(shot).toHaveAttribute('data-diary-shot', 'trade')
  await expect(shot).toHaveAttribute('src', new RegExp(`trade-light-ru-${device}`))
  await expect.poll(() => shot.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)

  await tabs.filter({ hasText: 'График сделки' }).click()
  await expect(shot).toHaveAttribute('src', new RegExp(`chart-light-ru-${device}`))
  await expect(block.locator('[data-diary-line]')).toContainText('Вход и выход на настоящей цене')
  await expect(tabs.filter({ hasText: 'График сделки' })).toHaveAttribute('aria-selected', 'true')

  // стрелки: с последней вкладки → по кругу на первую
  await tabs.filter({ hasText: 'График сделки' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(shot).toHaveAttribute('data-diary-shot', 'trade')
  await expect(tabs.filter({ hasText: 'Запись сделки' })).toBeFocused()

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
})

test('тёмная тема и английский — свои снимки', async ({ page, db }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cj-theme-v2', 'dark')
      localStorage.setItem('cj-lang', 'en')
    } catch {
      /* нет хранилища */
    }
  })
  await fakeSupabase(page, db, { signedIn: false })
  await page.goto('')
  const block = page.locator('[data-diary]')
  await block.scrollIntoViewIfNeeded()
  await expect(block.getByRole('tab').first()).toHaveText('Logging a trade')
  await expect(block.locator('[data-diary-shot]')).toHaveAttribute('src', /trade-dark-en-/)
})
