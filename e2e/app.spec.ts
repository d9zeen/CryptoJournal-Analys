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

  test('регистрация не принимает пароль короче 6 символов', async ({ page, db }) => {
    await fakeSupabase(page, db, { signedIn: false })
    await page.goto('register')
    await page.getByLabel('Email').fill('new@example.com')
    await page.getByLabel('Пароль', { exact: true }).fill('abc12')
    await page.getByLabel('Повтори пароль').fill('abc12')
    await page.getByRole('button', { name: 'Создать аккаунт' }).click()
    await expect(page.getByText('Пароль должен быть не короче 6 символов')).toBeVisible()
  })

  test('глазик показывает и прячет пароль', async ({ page, db }) => {
    await fakeSupabase(page, db, { signedIn: false })
    await page.goto('login')
    const field = page.getByLabel('Пароль', { exact: true })
    await field.fill('secret12')
    await expect(field).toHaveAttribute('type', 'password')
    await page.getByRole('button', { name: 'Показать пароль' }).click()
    await expect(field).toHaveAttribute('type', 'text')
    await expect(page.getByRole('button', { name: 'Скрыть пароль' })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Скрыть пароль' }).click()
    await expect(field).toHaveAttribute('type', 'password')
  })

  test('неверный пароль: ошибка выезжает, поле подсвечено', async ({ page, db }) => {
    db.loginFails = true
    await fakeSupabase(page, db, { signedIn: false })
    await page.goto('login')
    await page.getByLabel('Email').fill('trader@example.com')
    await page.getByLabel('Пароль', { exact: true }).fill('wrong-pass')
    await page.getByRole('button', { name: 'Войти' }).click()
    await expect(page.getByRole('alert')).toHaveText('Неверный email или пароль')
    await expect(page.getByLabel('Пароль', { exact: true })).toHaveAttribute('aria-invalid', 'true')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('вход: галочка в кнопке и переход в дневник', async ({ page, db }) => {
    await fakeSupabase(page, db, { signedIn: false })
    await page.goto('login')
    await page.getByLabel('Email').fill('trader@example.com')
    await page.getByLabel('Пароль', { exact: true }).fill('secret12')
    await page.getByRole('button', { name: 'Войти' }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
  })

  test('регистрация с подтверждением почты: экран «Проверь почту», повторная отправка через 0:30', async ({ page, db }) => {
    db.confirmEmail = true
    await fakeSupabase(page, db, { signedIn: false })
    await page.clock.install()
    await page.goto('register')
    await page.getByLabel('Email').fill('new@example.com')
    await page.getByLabel('Пароль', { exact: true }).fill('qwerty')
    // полоска надёжности только подсказывает: простой пароль из 6 символов разрешён
    await expect(page.getByText('Слабый')).toBeVisible()
    await page.getByLabel('Повтори пароль').fill('qwerty')
    await page.getByRole('button', { name: 'Создать аккаунт' }).click()
    const box = page.locator('[data-check-email]')
    await expect(box.getByRole('heading', { name: 'Проверь почту' })).toBeVisible()
    await expect(box).toContainText('new@example.com')
    const resend = box.getByRole('button', { name: /Отправить ещё раз/ })
    await expect(resend).toBeDisabled()
    await expect(resend).toContainText('0:30')
    await page.clock.runFor(31_000)
    await expect(resend).toBeEnabled()
    await resend.click()
    await expect(box.getByText('Отправили ещё раз.')).toBeVisible()
    expect(db.authCalls?.some((c) => c.path === '/auth/v1/resend')).toBe(true)
  })

  test('регистрация без подтверждения почты: сразу в дневник', async ({ page, db }) => {
    await fakeSupabase(page, db, { signedIn: false })
    await page.goto('register')
    await page.getByLabel('Email').fill('new@example.com')
    await page.getByLabel('Пароль', { exact: true }).fill('qwerty12')
    await page.getByLabel('Повтори пароль').fill('qwerty12')
    await page.getByRole('button', { name: 'Создать аккаунт' }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(page.locator('[data-check-email]')).toHaveCount(0)
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
      // широкий экран: подпись видна в самой панели, всплывающая подсказка — только у узкой панели (планшет)
      await expect(link.getByText('Разбор', { exact: true }).filter({ visible: true })).toBeVisible()
      await page.setViewportSize({ width: 900, height: 800 })
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
    await expect(html).toHaveAttribute('data-theme', 'light') // светлая по умолчанию
    await page.getByRole('button', { name: 'Тёмная тема' }).filter({ visible: true }).first().click()
    await expect(html).not.toHaveAttribute('data-theme', 'light')
    await page.reload()
    await expect(html).not.toHaveAttribute('data-theme', 'light')
    await page.goto('settings')
    await page.getByRole('radio', { name: 'Светлая' }).click()
    await expect(html).toHaveAttribute('data-theme', 'light')
  })

  test('главная: тема переключается в шапке, без вспышки после перезагрузки', async ({ page, db }) => {
    await fakeSupabase(page, db, { signedIn: false })
    await page.goto('')
    const html = page.locator('html')
    await expect(html).toHaveAttribute('data-theme', 'light') // светлая по умолчанию
    await expect(page.getByText('карта не нужна')).toHaveCount(0)
    await page.getByRole('button', { name: 'Тёмная тема' }).click()
    await expect(html).not.toHaveAttribute('data-theme', 'light')
    // выбор помнится и ставится ещё до загрузки приложения (public/theme-init.js)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(html).not.toHaveAttribute('data-theme', 'light')
    await page.getByRole('button', { name: 'Светлая тема' }).click()
    await expect(html).toHaveAttribute('data-theme', 'light')
  })
})

test.describe('админка', () => {
  const user = (over: Record<string, unknown>) => ({
    id: 'u1', email: 'friend@example.com', created_at: '2026-10-01T10:00:00Z', last_sign_in_at: '2026-11-04T10:00:00Z',
    plan: 'free', plan_until: null, plan_trial: false, effective_plan: 'free', trades_month: 30, trades_total: 120, is_admin: false, ...over,
  })

  test('обычному пользователю пункт не виден, страница закрыта', async ({ page, db }) => {
    await fakeSupabase(page, db)
    await page.goto('dashboard')
    await expect(page.getByRole('link', { name: 'Статистика' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Админка' })).toHaveCount(0)
    await page.goto('admin')
    await expect(page.getByText('Нет доступа')).toBeVisible()
  })

  test('админ видит пользователей и выдаёт Pro', async ({ page, db }) => {
    db.isAdmin = true
    db.adminUsers = [
      user({}),
      user({ id: 'u2', email: 'pro@example.com', plan: 'pro', effective_plan: 'pro', trades_month: 3, trades_total: 9 }),
      user({ id: 'u3', email: 'new@example.com', plan: 'pro_plus', effective_plan: 'pro_plus', plan_until: new Date(Date.now() + 5 * 86_400_000).toISOString(), plan_trial: true }),
    ]
    await fakeSupabase(page, db)
    // на телефоне админки нет в нижнем меню — ссылка внизу настроек
    await page.goto((page.viewportSize()?.width ?? 0) < 768 ? 'settings' : 'dashboard')
    await page.getByRole('link', { name: 'Админка' }).filter({ visible: true }).first().click()
    await expect(page.getByRole('heading', { name: 'Админка' })).toBeVisible()
    await expect(page.getByText('friend@example.com')).toBeVisible()
    await expect(page.getByText('Pro навсегда').first()).toBeVisible()
    // пробный период виден в списке
    await expect(page.getByText('пробный', { exact: true }).first()).toBeVisible()
    // по умолчанию выдаётся Pro Plus; можно выбрать Pro; сроки — 1 мес / 1 год / бессрочно
    await page.getByLabel('Какой тариф выдать').selectOption('pro')
    await page.getByRole('button', { name: '1 год' }).first().click()
    await expect(page.getByText('Готово: friend@example.com теперь на Pro.')).toBeVisible()
    const year = db.adminCalls?.[0] as { fn: string; body: { p_user: string; p_plan: string; p_until: string } }
    expect(year).toMatchObject({ fn: 'admin_set_plan', body: { p_user: 'u1', p_plan: 'pro' } })
    const days = (Date.parse(year.body.p_until) - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(360)
    expect(days).toBeLessThan(370)
    await page.getByRole('button', { name: '1 мес' }).first().click()
    const month = (Date.parse((db.adminCalls?.[1] as { body: { p_until: string } }).body.p_until) - Date.now()) / 86_400_000
    expect(month).toBeGreaterThan(27)
    expect(month).toBeLessThan(32)
    await page.getByLabel('Какой тариф выдать').selectOption('pro_plus')
    await page.getByRole('button', { name: 'бессрочно' }).first().click()
    expect(db.adminCalls?.[2]).toMatchObject({ fn: 'admin_set_plan', body: { p_user: 'u1', p_plan: 'pro_plus', p_until: null } })
    await page.getByRole('button', { name: 'Сбросить лимит' }).first().click()
    await expect(page.getByText('лимит friend@example.com в этом месяце сброшен')).toBeVisible()
    // выдать админку (с подтверждением)
    page.once('dialog', (d) => d.accept())
    await page.getByRole('button', { name: 'Сделать админом' }).first().click()
    await expect(page.getByText('Готово: friend@example.com теперь админ.')).toBeVisible()
    expect(db.adminCalls?.find((c) => c.fn === 'admin_set_admin')).toMatchObject({ body: { p_user: 'u1', p_admin: true } })
  })
})

test('страница тарифов: Basic, Pro, Pro Plus; месяц / год; текущий тариф', async ({ page, db }) => {
  db.usage = { plan: 'pro', trades_created: 3, trade_limit: null }
  await fakeSupabase(page, db)
  // телефон: ссылка из настроек (тарифа в шапке нет); компьютер: карточка тарифа в левой панели
  const phone = (page.viewportSize()?.width ?? 0) < 768
  await page.goto(phone ? 'settings' : 'dashboard')
  if (phone) await page.getByRole('link', { name: 'Сравнить тарифы' }).click()
  else await page.getByRole('link', { name: /^Pro(\s|$)/ }).filter({ visible: true }).first().click()
  await expect(page.getByRole('heading', { name: 'Тарифы' })).toBeVisible()
  for (const name of ['Basic', 'Pro', 'Pro Plus']) await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  const head = page.locator('thead')
  await expect(head).toContainText('$10')
  await expect(head).toContainText('$15')
  await expect(page.getByText('Твой тариф')).toBeVisible()
  if (!phone) await expect(page.getByText('Всё автоматически')).toBeVisible()
  await expect(page.getByText('Сделок в месяц', { exact: true }).locator('visible=true')).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: 'без лимита' })).toContainText(/50.*без лимита.*без лимита/)
  await expect(page.getByText('Биржи и кошельки: Bybit по ключу, Hyperliquid по адресу').locator('visible=true')).toBeVisible()
  await expect(page.getByText(/Цена основателя: Pro Plus за \$99 в год/)).toBeVisible()
  // за год: −20 %, цена в пересчёте на месяц
  await page.getByRole('radio', { name: /Год/ }).click()
  await expect(page.getByRole('radio', { name: /Год/ })).toContainText('−20 %')
  await expect(head).toContainText('$8')
  await expect(head).toContainText('$12')
  await expect(head).toContainText('$144 в год')
  // оплаты на сайте пока нет и про администратора не пишем
  await expect(page.getByText(/администратор/)).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Хочу этот тариф|Оплатить/ })).toHaveCount(0)
})

test('главная: гость видит страницу о сервисе с живым демо, вошедший — сразу дашборд', async ({ page, db }) => {
  await fakeSupabase(page, db, { signedIn: false })
  await page.goto('')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Дневник сделок для фьючерсов')
  await expect(page.getByText('Реализованный PnL')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Тарифы' })).toBeVisible()
  await page.getByRole('link', { name: 'Войти' }).first().click()
  await expect(page).toHaveURL(/\/login$/)
})

test('главная для вошедшего — дашборд', async ({ page, db }) => {
  db.trades = Array.from({ length: 3 }, (_, i) => makeTrade(i))
  await fakeSupabase(page, db)
  await page.goto('')
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByText('Ключевые цифры', { exact: true })).toBeVisible()
})

test('/welcome — главная для гостя открывается и после входа, кнопка ведёт в дневник', async ({ page, db }) => {
  await fakeSupabase(page, db)
  await page.goto('welcome')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Дневник сделок для фьючерсов')
  await page.getByRole('link', { name: 'Открыть дневник' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
})

test('первый вход: без сделок — шаги и живой пример; «Подключить биржу» ведёт к подключениям', async ({ page, db }) => {
  db.trades = []
  await fakeSupabase(page, db)
  await page.goto('dashboard')
  await expect(page.getByText('Начни за 2 минуты')).toBeVisible()
  await expect(page.getByText('Так будет выглядеть твоя статистика')).toBeVisible()
  // депозит в профиле уже указан — шаг отмечен; выбирать период пока не из чего
  await expect(page.getByLabel('Готово')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Всё время' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Подключить биржу' }).click()
  await expect(page).toHaveURL(/import#connections$/)
})

test('первый вход: биржа подключена, сделок ещё нет — шаг отмечен и видно, что подключено', async ({ page, db }) => {
  db.trades = []
  db.connections = [{ id: 'c1', exchange: 'bybit', label: null, api_key: 'xxxx', last_sync_at: null, cursor_at: null, last_error: null, key_expires_at: null, created_at: '2026-11-01T00:00:00Z' }]
  await fakeSupabase(page, db)
  await page.goto('dashboard')
  await expect(page.getByText('Подключено: Bybit. Сделки появятся после синхронизации.')).toBeVisible()
  await expect(page.getByText('Шаг 3 из 3')).toBeVisible()
})

test('стартовый экран можно открыть и при сделках: ?welcome=1', async ({ page, db }) => {
  db.trades = Array.from({ length: 3 }, (_, i) => makeTrade(i))
  await fakeSupabase(page, db)
  await page.goto('dashboard?welcome=1')
  await expect(page.getByText('Начни за 2 минуты')).toBeVisible()
})

test('ключевые цифры: последние 10 сделок буквами W / L и счёт побед / поражений', async ({ page, db }) => {
  // makeTrade: каждая третья сделка (i % 3 === 0) — в минус; последние 10 из 12 — i = 2…11: 3 поражения (3, 6, 9)
  db.trades = Array.from({ length: 12 }, (_, i) => makeTrade(i))
  await fakeSupabase(page, db)
  await page.goto('dashboard')
  const form = page.locator('[data-shot="form"]')
  await expect(form.getByText('Последние 10 сделок')).toBeVisible()
  await expect(form.getByLabel('Победа')).toHaveCount(7)
  await expect(form.getByLabel('Поражение')).toHaveCount(3)
})

test('палитра в «Настройки → Оформление» на Basic: три бесплатные, остальные под замком', async ({ page, db }) => {
  await fakeSupabase(page, db)
  await page.goto('settings')
  const strip = page.locator('[data-shot="palette"]')
  await expect(strip.getByRole('link', { name: 'Ещё 5 палитр — в Pro' })).toBeVisible()
  await expect(strip.getByRole('radio', { name: 'Палитра 4' })).toBeDisabled()
  await expect(page.locator('html')).not.toHaveAttribute('data-palette', /.+/)
  await strip.getByRole('radio', { name: 'Палитра 2' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'teal_salmon')
  await expect.poll(() => db.palette).toBe('teal_salmon')
})

test('палитра на Pro: выбор в настройках сохраняется в профиле и ставится на страницу', async ({ page, db }) => {
  db.usage.plan = 'pro'
  await fakeSupabase(page, db)
  await page.goto('settings')
  const strip = page.locator('[data-shot="palette"]')
  await strip.getByRole('radio', { name: 'Палитра 4' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'cyan_wine')
  await expect.poll(() => db.palette).toBe('cyan_wine')
  await expect(strip.getByRole('radio', { name: 'Палитра 4' })).toHaveAttribute('aria-checked', 'true')
})

test('тема: старый сохранённый выбор «тёмная» (cj-theme) больше не действует — открывается светлая', async ({ page, db }) => {
  await page.addInitScript(() => { try { localStorage.setItem('cj-theme', 'dark') } catch {} })
  await fakeSupabase(page, db, { signedIn: false })
  await page.goto('')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('«Данные и безопасность»: открывается без входа, ссылки с главной и из регистрации', async ({ page, db }) => {
  await fakeSupabase(page, db, { signedIn: false })
  await page.goto('')
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://d9zeen.github.io/CryptoJournal-Analys/og.png')
  await page.getByRole('contentinfo').getByRole('link', { name: 'Данные и безопасность' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Данные и безопасность' })).toBeVisible()
  await expect(page.getByText(/Supabase Vault/)).toBeVisible()
  await page.goto('register')
  await page.getByRole('link', { name: 'Данные и безопасность' }).click()
  await expect(page).toHaveURL(/\/privacy$/)
})

test('пробный Pro Plus: в карточке тарифа — сколько дней осталось, за 2 дня — плашка на дашборде', async ({ page, db }) => {
  db.usage = { plan: 'pro_plus', trades_created: 3, trade_limit: null }
  db.planTrial = true
  db.planUntil = new Date(Date.now() + 1.5 * 86_400_000).toISOString()
  db.trades = [makeTrade(1, { pnl: 50 })]
  await fakeSupabase(page, db)
  await page.goto('dashboard')
  const banner = page.locator('[data-plan-ending]')
  await expect(banner).toContainText('Пробный Pro Plus закончится через 2 дня.')
  await expect(banner.getByRole('link', { name: 'Тарифы' })).toBeVisible()
  if ((page.viewportSize()?.width ?? 0) >= 1024) await expect(page.locator('[data-plan-term]')).toContainText('Pro Plus — пробный, осталось 2 дня')
})

test('Pro со сроком: «Pro до …», за 3 дня — плашка «Продлить»; раньше плашки нет', async ({ page, db }) => {
  db.usage = { plan: 'pro', trades_created: 3, trade_limit: null }
  db.planUntil = new Date(Date.now() + 10 * 86_400_000).toISOString()
  db.trades = [makeTrade(1, { pnl: 50 })]
  await fakeSupabase(page, db)
  await page.goto('settings')
  await expect(page.getByText(/^Pro до \d\d\.\d\d\.\d{4}$/).locator('visible=true').first()).toBeVisible()
  await page.goto('dashboard')
  await expect(page.locator('[data-plan-ending]')).toHaveCount(0)
  db.planUntil = new Date(Date.now() + 2.5 * 86_400_000).toISOString()
  await page.reload()
  await expect(page.locator('[data-plan-ending]').getByRole('link', { name: 'Продлить' })).toBeVisible()
})

test('лимит Basic 50 сделок: строка с предложением тарифа на странице сделок', async ({ page, db }) => {
  db.usage = { plan: 'free', trades_created: 50, trade_limit: 50 }
  await fakeSupabase(page, db)
  await page.goto('trades')
  const line = page.locator('[data-upgrade]').filter({ hasText: 'Лимит Basic — 50 сделок в месяц' })
  await expect(line).toBeVisible()
  await expect(line.getByRole('link', { name: 'Тарифы' })).toBeVisible()
  await page.goto('trades/new')
  await expect(page.getByText('Лимит Basic исчерпан: 50 из 50 сделок в этом месяце.')).toBeVisible()
})

test('Basic: два скриншота на сделку, дальше — строка про Pro', async ({ page, db }) => {
  const shot = (n: number) => ({ id: `sh${n}`, trade_id: '00000000-0000-0000-0000-000000000001', path: `${'11111111-1111-1111-1111-111111111111'}/t/${n}.webp`, sort_order: n, created_at: '' })
  db.trades = [makeTrade(1, { trade_screenshots: [shot(1), shot(2)] })]
  await fakeSupabase(page, db)
  await page.goto('trades/00000000-0000-0000-0000-000000000001')
  await expect(page.getByText('Добавлено максимум для тарифа — 2 шт.')).toBeVisible()
  await expect(page.locator('[data-upgrade]').filter({ hasText: 'На Basic — 2 скриншота на сделку' })).toBeVisible()
})

test('кнопка «Сохранить сделку»: крутилка в круге → галочка → назад к сделкам', async ({ page, db }) => {
  await fakeSupabase(page, db)
  // ответ на сохранение — с задержкой, чтобы увидеть состояние «идёт сохранение»
  await page.route('https://fake.supabase.test/rest/v1/trades*', async (route) => {
    if (route.request().method() === 'POST') await new Promise((r) => setTimeout(r, 400))
    await route.fallback()
  })
  await page.goto('trades/new')
  await page.getByLabel('Пара').fill('BTCUSDT')
  await page.getByLabel('Цена входа').fill('60000')
  await page.getByLabel('Цена выхода').fill('61000')
  await page.getByLabel('Размер позиции, $').fill('600')
  const btn = page.getByRole('button', { name: 'Сохранить сделку' })
  await btn.click()
  const save = page.locator('button[data-state]')
  await expect(save).toHaveAttribute('data-state', 'busy')
  await expect(save).toHaveAttribute('data-state', 'done')
  await expect(save.getByText('Готово')).toBeAttached()
  await expect(page).toHaveURL(/\/trades$/)
})

test('кнопка «Сохранить сделку»: ошибка — кнопка возвращается, ошибка видна', async ({ page, db }) => {
  await fakeSupabase(page, db)
  await page.route('https://fake.supabase.test/rest/v1/trades*', async (route) => {
    if (route.request().method() === 'POST') return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'FREE_LIMIT_REACHED', code: 'P0001' }) })
    await route.fallback()
  })
  await page.goto('trades/new')
  await page.getByLabel('Пара').fill('BTCUSDT')
  await page.getByLabel('Цена входа').fill('60000')
  await page.getByLabel('Цена выхода').fill('61000')
  await page.getByLabel('Размер позиции, $').fill('600')
  await page.getByRole('button', { name: 'Сохранить сделку' }).click()
  await expect(page.getByRole('alert')).toContainText('Достигнут лимит Basic')
  await expect(page.locator('button[data-state]')).toHaveAttribute('data-state', 'idle')
  await expect(page).toHaveURL(/\/trades\/new$/)
})
