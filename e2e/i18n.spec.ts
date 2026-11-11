// Языки сайта: английский по умолчанию, русский — по переключателю; выбор запоминается
import { test, expect, fakeSupabase, makeTrade } from './fixtures'

test.describe('язык по умолчанию — английский', () => {
  // язык не выбран: сайт открывается так, как его видит новый человек
  test.use({ lang: null })

  test('главная, вход и регистрация на английском, <html lang="en">', async ({ page, db }) => {
    await fakeSupabase(page, db, { signedIn: false })
    await page.goto('')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Trading journal')
    await expect(page.getByRole('heading', { name: 'Pricing', level: 2 })).toBeVisible()
    await page.goto('login')
    await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible()
    await page.goto('register')
    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible()
  })

  test('переключатель: русский на главной, выбор сохраняется после перезагрузки', async ({ page, db }) => {
    await fakeSupabase(page, db, { signedIn: false })
    await page.goto('')
    await page.getByRole('button', { name: 'Language: English' }).click()
    await page.getByRole('menuitemradio', { name: 'Русский' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Дневник сделок')
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Дневник сделок')
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
    // и обратно
    await page.getByRole('button', { name: 'Язык: Русский' }).click()
    await page.getByRole('menuitemradio', { name: 'English' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Trading journal')
  })

  test('меню закрывается по Esc', async ({ page, db }) => {
    await fakeSupabase(page, db, { signedIn: false })
    await page.goto('login')
    await page.getByRole('button', { name: 'Language: English' }).click()
    await expect(page.getByRole('menu')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toBeHidden()
  })
})

test.describe('в дневнике', () => {
  test.use({ lang: 'en' })

  test('дашборд на английском: подписи и числа в американском формате ($1,234.56)', async ({ page, db }) => {
    db.trades = [makeTrade(1, { pnl: 1234.56 }), makeTrade(2, { pnl: 100 })]
    await fakeSupabase(page, db)
    await page.goto('dashboard')
    await expect(page.getByRole('heading', { name: 'Statistics' })).toBeVisible()
    await expect(page.getByText('+$1,334.56').first()).toBeVisible()
  })

  test('язык меняется в «Настройки → Оформление»', async ({ page, db }) => {
    await fakeSupabase(page, db)
    await page.goto('settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await page.getByRole('radio', { name: 'Русский' }).click()
    await expect(page.getByRole('heading', { name: 'Настройки' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
  })
})
