import { test, expect, fakeSupabase, makeTrade } from './fixtures'

const BINANCE_CSV = [
  'Date(UTC),Symbol,Side,Price,Quantity,Amount,Fee,Realized Profit',
  '2026-11-02 12:00:00,ETHUSDT,BUY,2900,1,2900,1.16USDT,100',
  '2026-11-02 10:00:00,ETHUSDT,SELL,3000,1,3000,1.2USDT,0',
  '2026-11-01 12:00:00,BTCUSDT,SELL,61000,0.01,610,0.2USDT,10',
  '2026-11-01 10:00:00,BTCUSDT,BUY,60000,0.01,600,0.2USDT,0',
].join('\n')

test.describe('вход', () => {
  test('гость попадает на страницу входа', async ({ page, db }) => {
    await fakeSupabase(page, db, { signedIn: false })
    await page.goto('dashboard')
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: 'Вход' })).toBeVisible()
  })

  test('регистрация не принимает слабый пароль', async ({ page, db }) => {
    await fakeSupabase(page, db, { signedIn: false })
    await page.goto('register')
    await page.getByLabel('Email').fill('new@example.com')
    await page.getByLabel('Пароль', { exact: true }).fill('abcdefghijk')
    await page.getByLabel('Повтори пароль').fill('abcdefghijk')
    await page.getByRole('button', { name: 'Создать аккаунт' }).click()
    await expect(page.getByText('Пароль слишком простой')).toBeVisible()
  })

  test('при включённой 2FA после пароля спрашивается код', async ({ page, db }) => {
    db.factors = [{ id: 'f1', factor_type: 'totp', status: 'verified', friendly_name: 'x', created_at: '', updated_at: '' }]
    await fakeSupabase(page, db)
    await page.goto('dashboard')
    await expect(page.getByRole('heading', { name: 'Подтверждение входа' })).toBeVisible()
    await expect(page.getByText('Реализованный PnL')).toHaveCount(0)
  })
})

test.describe('дашборд и сделки', () => {
  test('дашборд считает статистику и рисует графики', async ({ page, db }) => {
    db.trades = Array.from({ length: 12 }, (_, i) => makeTrade(i))
    await fakeSupabase(page, db)
    await page.goto('dashboard')
    await expect(page.getByText('Реализованный PnL')).toBeVisible()
    await expect(page.getByText('сделок: 12').first()).toBeVisible()
    await expect(page.locator('.recharts-surface').first()).toBeVisible()
  })

  test('кривая капитала: $ / % и таблица сделок в отдельном окне', async ({ page, db }) => {
    db.trades = Array.from({ length: 12 }, (_, i) => makeTrade(i))
    await fakeSupabase(page, db)
    await page.goto('dashboard')
    await expect(page.getByRole('heading', { name: 'Кривая капитала' })).toBeVisible()
    await page.getByRole('radio', { name: '%' }).click()
    await expect(page.getByText('Накопленный PnL в % от депозита')).toBeVisible()
    await page.getByRole('button', { name: 'Таблица сделок' }).click()
    const dialog = page.getByRole('dialog', { name: 'Таблица сделок' })
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('tbody tr')).toHaveCount(12)
    await expect(dialog.locator('tbody tr').first()).toContainText('%')
    await dialog.getByRole('button', { name: 'Закрыть' }).click()
    await expect(dialog).toBeHidden()
  })

  test('вкладка «Разбор»: таблицы ушли с дашборда сюда, меню — иконки с подписью', async ({ page, db }, info) => {
    db.trades = Array.from({ length: 6 }, (_, i) => makeTrade(i))
    await fakeSupabase(page, db)
    await page.goto('dashboard')
    await expect(page.getByText('Реализованный PnL')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Сетапы' })).toHaveCount(0)
    const link = page.getByRole('link', { name: 'Разбор' })
    if (info.project.name === 'desktop') {
      await link.hover()
      await expect(page.getByRole('tooltip', { name: 'Разбор' })).toBeVisible()
    }
    await link.click()
    await expect(page).toHaveURL(/\/analysis$/)
    await expect(page.getByRole('heading', { name: 'Разбор сделок' })).toBeVisible()
    for (const name of ['Сетапы', 'Топ ошибок', 'Пары', 'Эмоции', 'Long / Short']) await expect(page.getByRole('heading', { name })).toBeVisible()
  })

  test('свой диапазон: календарь с быстрыми вариантами, применяется кнопкой', async ({ page, db }) => {
    db.trades = Array.from({ length: 6 }, (_, i) => makeTrade(i))
    await fakeSupabase(page, db)
    await page.goto('dashboard')
    await page.getByRole('radio', { name: 'Свой диапазон' }).click()
    const picker = page.getByRole('dialog', { name: 'Свой диапазон' })
    await expect(picker).toBeVisible()
    await expect(picker.getByRole('button', { name: 'Применить' })).toBeDisabled()
    await picker.getByRole('button', { name: 'Прошлый месяц' }).click()
    await picker.getByRole('button', { name: 'Применить' }).click()
    await expect(picker).toBeHidden()
    await expect(page.getByRole('radio', { name: /—/ })).toHaveAttribute('aria-checked', 'true')
    // Esc закрывает без изменений
    await page.getByRole('radio', { name: /—/ }).click()
    await expect(picker).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(picker).toBeHidden()
  })

  test('список сделок по умолчанию за всё время (старые сделки видны)', async ({ page, db }) => {
    db.trades = [makeTrade(0, { symbol: 'OLDUSDT', entry_at: '2025-01-05T10:00:00Z', exit_at: '2025-01-05T12:00:00Z' })]
    await fakeSupabase(page, db)
    await page.goto('trades')
    await expect(page.getByText('OLDUSDT').filter({ visible: true }).first()).toBeVisible()
  })

  test('пустой дневник предлагает импорт', async ({ page, db }) => {
    await fakeSupabase(page, db)
    await page.goto('trades')
    await expect(page.getByRole('button', { name: 'Загрузить файл с биржи' })).toBeVisible()
  })

  test('форма сделки: проверка полей и расчёт PnL', async ({ page, db }) => {
    await fakeSupabase(page, db)
    await page.goto('trades/new')
    await page.getByRole('button', { name: 'Сохранить сделку' }).click()
    await expect(page.getByText('Исправь ошибки в форме.')).toBeVisible()

    await page.getByLabel('Пара').fill('BTCUSDT')
    await page.getByLabel('Цена входа').fill('60000')
    await page.getByLabel('Цена выхода').fill('61 000')
    await page.getByLabel('Размер позиции, $').fill('600')
    await page.getByLabel('Комиссии, $').fill('0,6')
    await expect(page.getByText('+9,40 $')).toBeVisible() // (61000−60000)×0.01 − 0.6
    await page.getByRole('button', { name: 'Сохранить сделку' }).click()
    await expect(page).toHaveURL(/\/trades$/)
    const sent = db.inserted.find((x) => x.table === 'trades')!.body as Record<string, unknown>
    expect(sent).toMatchObject({ symbol: 'BTCUSDT', side: 'long', entry_price: 60000, exit_price: 61000, size_usd: 600, pnl: 9.4 })
  })
})

test.describe('импорт', () => {
  test('файл Binance: биржа определена, сделки собраны и импортированы', async ({ page, db }) => {
    await fakeSupabase(page, db)
    await page.goto('import')
    await page.locator('input[type=file]').setInputFiles({ name: 'binance-futures.csv', mimeType: 'text/csv', buffer: Buffer.from(BINANCE_CSV) })
    await expect(page.getByLabel('Биржа').locator('option').first()).toHaveText('Авто: Binance')
    await expect(page.getByText('Новых: 2')).toBeVisible()
    await page.getByRole('button', { name: 'Импортировать 2' }).click()
    await expect(page.getByText('Готово: импортировано сделок — 2.')).toBeVisible()
    const rows = db.inserted.filter((x) => x.table === 'trades').flatMap((x) => x.body as Record<string, unknown>[])
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => [r.symbol, r.side, r.exchange, r.source])).toEqual([
      ['BTCUSDT', 'long', 'binance', 'import'],
      ['ETHUSDT', 'short', 'binance', 'import'],
    ])
    expect(db.imports[0]).toMatchObject({ exchange: 'binance', rows_imported: 2 })
  })
})

test.describe('настройки', () => {
  test('включение 2FA показывает QR-код', async ({ page, db }) => {
    await fakeSupabase(page, db)
    await page.goto('settings')
    await page.getByRole('button', { name: 'Включить 2FA' }).click()
    const qr = page.getByAltText('QR')
    await expect(qr).toBeVisible()
    expect(await qr.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0)
    await expect(page.getByText('JBSWY3DPEHPK3PXP')).toBeVisible()
  })
})

test.describe('оформление', () => {
  test('тема переключается в шапке и запоминается после перезагрузки', async ({ page, db }) => {
    await fakeSupabase(page, db)
    await page.goto('dashboard')
    const html = page.locator('html')
    await expect(html).not.toHaveAttribute('data-theme', 'light') // тёмная по умолчанию
    await page.getByRole('button', { name: 'Светлая тема' }).click()
    await expect(html).toHaveAttribute('data-theme', 'light')
    await page.reload()
    await expect(html).toHaveAttribute('data-theme', 'light')
    await page.goto('settings')
    await page.getByRole('radio', { name: 'Тёмная' }).click()
    await expect(html).not.toHaveAttribute('data-theme', 'light')
  })
})

test.describe('админка', () => {
  const user = (over: Record<string, unknown>) => ({
    id: 'u1', email: 'friend@example.com', created_at: '2026-10-01T10:00:00Z', last_sign_in_at: '2026-11-04T10:00:00Z',
    plan: 'free', plan_until: null, effective_plan: 'free', trades_month: 30, trades_total: 120, is_admin: false, ...over,
  })

  test('обычному пользователю пункт не виден, страница закрыта', async ({ page, db }) => {
    await fakeSupabase(page, db)
    await page.goto('dashboard')
    await expect(page.getByRole('link', { name: 'Дашборд' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Админка' })).toHaveCount(0)
    await page.goto('admin')
    await expect(page.getByText('Нет доступа')).toBeVisible()
  })

  test('админ видит пользователей и выдаёт Pro', async ({ page, db }) => {
    db.isAdmin = true
    db.adminUsers = [user({}), user({ id: 'u2', email: 'pro@example.com', plan: 'pro', effective_plan: 'pro', trades_month: 3, trades_total: 9 })]
    await fakeSupabase(page, db)
    await page.goto('dashboard')
    await page.getByRole('link', { name: 'Админка' }).click()
    await expect(page.getByRole('heading', { name: 'Админка' })).toBeVisible()
    await expect(page.getByText('friend@example.com')).toBeVisible()
    await expect(page.getByText('Pro навсегда').first()).toBeVisible()
    // по умолчанию выдаётся Pro Plus; можно выбрать Pro
    await page.getByLabel('Какой тариф выдать').selectOption('pro')
    await page.getByRole('button', { name: 'Pro · 30 дней' }).first().click()
    await expect(page.getByText('Готово: friend@example.com теперь на Pro.')).toBeVisible()
    expect(db.adminCalls?.[0]).toMatchObject({ fn: 'admin_set_plan', body: { p_user: 'u1', p_plan: 'pro' } })
    await page.getByLabel('Какой тариф выдать').selectOption('pro_plus')
    await page.getByRole('button', { name: 'Pro Plus · Навсегда' }).first().click()
    expect(db.adminCalls?.[1]).toMatchObject({ fn: 'admin_set_plan', body: { p_user: 'u1', p_plan: 'pro_plus', p_until: null } })
    await page.getByRole('button', { name: 'Сбросить лимит' }).first().click()
    await expect(page.getByText('лимит friend@example.com в этом месяце сброшен')).toBeVisible()
    // выдать админку (с подтверждением)
    page.once('dialog', (d) => d.accept())
    await page.getByRole('button', { name: 'Сделать админом' }).first().click()
    await expect(page.getByText('Готово: friend@example.com теперь админ.')).toBeVisible()
    expect(db.adminCalls?.find((c) => c.fn === 'admin_set_admin')).toMatchObject({ body: { p_user: 'u1', p_admin: true } })
  })
})

test('страница тарифов: Basic, Pro, Pro Plus; текущий тариф и тариф в шапке', async ({ page, db }) => {
  db.usage = { plan: 'pro', trades_created: 3, trade_limit: 50 }
  await fakeSupabase(page, db)
  await page.goto('dashboard')
  await page.getByRole('link', { name: 'Pro', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Тарифы' })).toBeVisible()
  for (const name of ['Basic', 'Pro', 'Pro Plus']) await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  await expect(page.getByText('$10 / мес')).toBeVisible()
  await expect(page.getByText('$15 / мес')).toBeVisible()
  await expect(page.getByText('Твой тариф')).toBeVisible()
  await expect(page.getByText('Сделок в месяц: 50')).toBeVisible()
  await expect(page.getByText(/каждые 3 часа — даже когда сайт закрыт/)).toBeVisible()
  await page.getByRole('button', { name: 'Хочу этот тариф' }).click()
  await expect(page.getByText(/напиши администратору сайта/)).toBeVisible()
})
