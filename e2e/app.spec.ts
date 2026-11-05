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
