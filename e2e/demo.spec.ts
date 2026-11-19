// «Открыть демо» без регистрации (0024): вход гостем, демо-счёт из превью главной, плашка, ограничения гостя, выход в регистрацию
import { test, expect, fakeSupabase } from './fixtures'

test('главная → «Открыть демо»: гость сразу в дневнике с 60 демо-сделками', async ({ page, db }) => {
  db.usage = { plan: 'pro_plus', trades_created: 0, trade_limit: null }
  db.listNames = ['Пробой уровня', 'Ретест', 'Поздний вход', 'Без стопа', 'Двинул стоп', 'Спокоен', 'Страх']
  await fakeSupabase(page, db, { signedIn: false })
  await page.goto('')
  await page.locator('main [data-open-demo]').click()

  await expect(page).toHaveURL(/\/dashboard$/)
  // вошли гостем (signup без почты), сделки записаны одним запросом, у части — ошибки, депозит 5 000 $
  expect(db.authCalls?.some((c) => c.path === '/auth/v1/signup' && !(c.body as { email?: string }).email)).toBe(true)
  const tradesInsert = db.inserted.find((x) => x.table === 'trades')!.body as Record<string, unknown>[]
  expect(tradesInsert).toHaveLength(60)
  expect(tradesInsert.every((x) => x.pnl_manual === true && String(x.external_id).startsWith('demo:'))).toBe(true)
  expect(db.inserted.some((x) => x.table === '/rest/v1/trade_mistakes')).toBe(true)

  // плашка демо и дашборд с данными
  const banner = page.locator('[data-demo-banner]')
  await expect(banner).toContainText('Это демо-счёт.')
  await expect(page.getByText('сделок: 60').first()).toBeVisible()

  // гостю нельзя: делиться портфелем, загружать скриншоты
  await page.goto('portfolio')
  await expect(page.getByRole('button', { name: 'Поделиться' })).toHaveCount(0)
  await page.goto('trades/new')
  await expect(page.locator('[data-guest-line]')).toContainText('В демо скриншоты не загружаются.')

  // «Создать свой аккаунт» — демо-аккаунт удаляется сразу, дальше регистрация
  await banner.getByRole('button', { name: 'Создать свой аккаунт' }).click()
  await expect(page).toHaveURL(/\/register$/)
  expect(db.authCalls?.some((c) => c.path.endsWith('/rpc/delete_my_account'))).toBe(true)
})

test('гость не подключает биржи: вместо формы ключа — строка про свой аккаунт', async ({ page, db }) => {
  db.usage = { plan: 'pro_plus', trades_created: 0, trade_limit: null }
  db.guest = true
  await fakeSupabase(page, db)
  await page.goto('import')
  await page.locator('[data-exchange="bybit"]').first().click()
  await expect(page.locator('[data-guest-line]')).toContainText('В демо биржи и кошельки не подключаются')
  await expect(page.getByLabel('API key')).toHaveCount(0)
})

test('анонимный вход выключен в Supabase — понятное сообщение и «Начать бесплатно»', async ({ page, db }) => {
  db.anonDisabled = true
  await fakeSupabase(page, db, { signedIn: false })
  await page.goto('demo')
  await expect(page.locator('[data-demo-failed]')).toContainText('Демо сейчас не открылось')
  await page.getByRole('link', { name: 'Начать бесплатно' }).click()
  await expect(page).toHaveURL(/\/register$/)
})

test('вошёл по-настоящему — «Открыть демо» ведёт в свой дашборд, гостем не входит', async ({ page, db }) => {
  await fakeSupabase(page, db)
  await page.goto('demo')
  await expect(page).toHaveURL(/\/dashboard$/)
  expect(db.authCalls?.some((c) => c.path === '/auth/v1/signup') ?? false).toBe(false)
  await expect(page.locator('[data-demo-banner]')).toHaveCount(0)
})
