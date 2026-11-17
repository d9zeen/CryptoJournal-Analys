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
    // язык писем: шаблоны Supabase выбирают текст по user_metadata.lang (docs/email-templates)
    expect(db.authCalls?.find((c) => c.path === '/auth/v1/signup')?.body).toMatchObject({ data: { lang: 'ru' } })
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
    // одна таблица и вкладки над ней; Long / Short — сводка сверху
    for (const name of ['Сетапы', 'Ошибки', 'Пары', 'Эмоции']) await expect(page.getByRole('tab', { name: new RegExp(`^${name}`) })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Long / Short' })).toBeAttached()
  })

  test('«Разбор»: суммы в таблицах видны целиком на 390 и 1440', async ({ page, db }) => {
    db.listNames = ['Пробой уровня после долгого боковика', 'Отбой', 'Вход без стопа и без плана', 'FOMO']
    db.trades = Array.from({ length: 40 }, (_, i) =>
      makeTrade(i, {
        pnl: i % 3 === 0 ? -(1200 + i * 37.13) : 2400 + i * 41.27,
        symbol: ['1000PEPEUSDT', 'BTCUSDT', 'ETHUSDT', 'DOGEUSDT'][i % 4],
        setup_id: `s${1 + (i % 4)}`,
        emotion_id: `s${1 + ((i + 1) % 4)}`,
        trade_mistakes: i % 3 === 0 ? [{ tag_id: `s${1 + (i % 4)}` }] : [],
      }),
    )
    await fakeSupabase(page, db)
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      for (const tab of ['setups', 'mistakes', 'pairs', 'emotions']) {
      await page.goto(`analysis?tab=${tab}`)
      const cells = page.locator('[data-money]').filter({ visible: true })
      await expect(cells.first()).toContainText('$')
      const clipped = await cells.evaluateAll((els) =>
        els
          .filter((td) => {
            const card = td.closest('table')!.parentElement!.getBoundingClientRect()
            const r = td.getBoundingClientRect()
            const inner = [td, ...td.querySelectorAll('*')].some((e) => e.scrollWidth > e.clientWidth + 1)
            return inner || r.right > card.right + 1
          })
          .map((e) => e.textContent),
      )
      expect(clipped, `обрезаны на ${width}px`).toEqual([])
      }
    }
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

  test('шапка телефона 390px: «+ Новая сделка» есть на /trades, но не на /trades/new и /trades/:id', async ({ page, db }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    db.trades = [makeTrade(0)]
    await fakeSupabase(page, db)
    const plus = page.locator('header').getByRole('link', { name: 'Новая сделка' })
    await page.goto('trades')
    await expect(plus).toBeVisible()
    await plus.click()
    await expect(page).toHaveURL(/\/trades\/new$/)
    await expect(page.getByRole('heading', { name: 'Новая сделка' })).toBeVisible()
    await expect(plus).toHaveCount(0)
    await page.goto(`trades/${db.trades[0].id}`)
    await expect(page.getByRole('button', { name: 'Сохранить сделку' })).toBeVisible()
    await expect(plus).toHaveCount(0)
  })

  test('форма сделки на телефоне 390px: «Сохранить» в заголовке, нижнего меню нет, поля не закрыты', async ({ page, db }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await fakeSupabase(page, db)
    await page.goto('trades/new')
    const save = page.getByRole('button', { name: 'Сохранить сделку' })
    await expect(save).toHaveCount(1) // нижней полосы с кнопками нет — одна кнопка, в заголовке
    await expect(save).toHaveText('Сохранить')
    const head = (await page.getByRole('heading', { name: 'Новая сделка' }).boundingBox())!
    const btn = (await save.boundingBox())!
    expect(Math.abs(btn.y + btn.height / 2 - (head.y + head.height / 2))).toBeLessThan(12)
    await expect(page.getByRole('link', { name: 'Календарь' })).toHaveCount(0) // нижнего меню нет
    // «Размер позиции» доводим до низа экрана: поверх него ничего не лежит
    const size = page.getByLabel('Размер позиции, $')
    await size.evaluate((el) => el.scrollIntoView({ block: 'end' }))
    const b = (await size.boundingBox())!
    expect(b.y + b.height).toBeLessThanOrEqual(844)
    const top = await page.evaluate(([x, y]) => (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('input')?.id ?? null, [b.x + 10, b.y + b.height - 4])
    expect(top).toBe(await size.getAttribute('id'))
    // сохранение работает
    await page.getByLabel('Пара').fill('BTCUSDT')
    await page.getByLabel('Цена входа').fill('60000')
    await page.getByLabel('Цена выхода').fill('61000')
    await size.fill('600')
    await save.click()
    await expect(page).toHaveURL(/\/trades$/)
    expect(db.inserted.find((x) => x.table === 'trades')!.body).toMatchObject({ symbol: 'BTCUSDT', size_usd: 600 })
    await expect(page.getByRole('link', { name: 'Календарь' })).toBeVisible() // в списке сделок меню снова есть
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
    // B «Сканер»: сайт сам подписал колонки файла
    const scan = page.locator('[data-scan]')
    await expect(scan).toContainText('Узнали файл: Binance')
    await expect(scan.locator('[data-scan-label="symbol"]')).toHaveText('Пара')
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

  test('большой файл: при записи в базу — полоса прогресса «500 из 1 040 сделок» (по пачкам)', async ({ page, db }) => {
    db.usage = { plan: 'pro_plus', trades_created: 0, trade_limit: null }
    await fakeSupabase(page, db)
    // каждую пачку «база» отвечает с задержкой — успеваем увидеть полосу
    await page.route('**/rest/v1/trades*', async (route) => {
      if (route.request().method() === 'POST') await new Promise((r) => setTimeout(r, 700))
      await route.fallback()
    })
    const base = Date.UTC(2026, 9, 1, 0)
    const lines = ['Date(UTC),Symbol,Side,Price,Quantity,Amount,Fee,Realized Profit']
    for (let i = 0; i < 1040; i++) {
      const at = (ms: number) => new Date(base + i * 2 * 3_600_000 + ms).toISOString().slice(0, 19).replace('T', ' ')
      lines.push(`${at(0)},BTCUSDT,BUY,60000,0.01,600,0.2USDT,0`, `${at(3_600_000)},BTCUSDT,SELL,61000,0.01,610,0.2USDT,10`)
    }
    await page.goto('import')
    await page.locator('input[type=file]').setInputFiles({ name: 'binance-big.csv', mimeType: 'text/csv', buffer: Buffer.from(lines.join('\n')) })
    await page.getByRole('button', { name: /Импортировать 1\s?040/ }).click()
    const bar = page.getByRole('progressbar', { name: 'Записываю сделки…' })
    await expect(bar).toContainText(/500 из 1\s040 сделок/)
    await expect(bar).toHaveAttribute('aria-valuenow', '500')
    // окошко в углу показывает тот же прогресс
    await expect(page.locator('[data-activity-item="file"]')).toContainText(/500 из 1\s040 сделок/)
    await expect(page.getByText(/Готово: импортировано сделок — 1\s?040/)).toBeVisible()
    // E «В календарь»: дни месяца последней сделки окрашиваются
    const done = page.locator('[data-import-done]')
    await expect(done).toHaveAttribute('data-landed', 'all', { timeout: 15_000 })
    expect(await done.locator('[data-cal-day][data-lit]').count()).toBeGreaterThan(5)
    await expect(done.getByRole('link', { name: /Открыть календарь/ })).toHaveAttribute('href', /calendar\?day=2026-/)
    await expect(bar).toHaveCount(0)
    // окошко остаётся и на другой странице, со ссылкой «К сделкам»
    await expect(page.locator('[data-activity-item="file"]')).toHaveAttribute('data-status', 'done')
    await page.goto('trades')
    await expect(page.locator('[data-activity]')).toHaveCount(0) // после перезагрузки страницы окошка нет — загрузка уже закончилась
  })
})

test.describe('настройки', () => {
  test('включение 2FA показывает QR-код', async ({ page, db }) => {
    await fakeSupabase(page, db)
    await page.goto('settings#security')
    await page.getByRole('button', { name: 'Включить 2FA' }).click()
    const qr = page.getByAltText('QR')
    await expect(qr).toBeVisible()
    expect(await qr.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0)
    await expect(page.getByText('JBSWY3DPEHPK3PXP')).toBeVisible()
  })
})

test.describe('настройки: вкладки', () => {
  test('/settings#security сразу открывает «Безопасность»; без адреса — «Профиль»; клик меняет адрес', async ({ page, db }) => {
    await fakeSupabase(page, db)
    await page.goto('settings#security')
    await expect(page.getByRole('tab', { name: 'Безопасность' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tabpanel')).toContainText('Двухфакторная защита (2FA)')
    await expect(page.getByRole('tabpanel')).not.toContainText('Часовой пояс')
    await page.goto('settings')
    await expect(page.getByRole('tab', { name: 'Профиль' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tabpanel')).toContainText('Часовой пояс')
    await page.getByRole('tab', { name: 'Списки' }).click()
    await expect(page).toHaveURL(/\/settings#lists$/)
    await expect(page.getByRole('heading', { name: 'Сетапы' })).toBeVisible()
    // стрелки переключают вкладки
    await page.keyboard.press('ArrowRight')
    await expect(page).toHaveURL(/\/settings#data$/)
    await expect(page.getByRole('tabpanel').getByRole('button', { name: 'Выйти' })).toBeVisible()
  })

  test('на компьютере вкладки — колонкой слева, на телефоне — полосой сверху; активная видна целиком', async ({ page, db }) => {
    await fakeSupabase(page, db)
    await page.goto('settings#plan')
    const tabs = page.getByRole('tab')
    const first = (await tabs.first().boundingBox())!
    const second = (await tabs.nth(1).boundingBox())!
    const panel = (await page.getByRole('tabpanel').boundingBox())!
    if ((page.viewportSize()?.width ?? 0) >= 1024) {
      expect(second.y).toBeGreaterThan(first.y) // друг под другом
      expect(panel.x).toBeGreaterThan(first.x + first.width) // содержимое справа
    } else {
      expect(Math.abs(second.y - first.y)).toBeLessThan(2) // в одну строку
      expect(panel.y).toBeGreaterThan(first.y + first.height) // содержимое ниже
      const active = (await page.getByRole('tab', { name: 'Тариф' }).boundingBox())!
      const vw = page.viewportSize()!.width
      expect(active.x).toBeGreaterThanOrEqual(0)
      expect(active.x + active.width).toBeLessThanOrEqual(vw)
    }
  })

  test('на 390px ни одна вкладка (кроме «Списков») не длиннее ~1,5 экрана', async ({ page, db }) => {
    db.usage = { plan: 'pro_plus', trades_created: 3, trade_limit: null }
    await page.setViewportSize({ width: 390, height: 844 })
    await fakeSupabase(page, db)
    for (const tab of ['profile', 'appearance', 'security', 'data', 'plan']) {
      await page.goto(`settings#${tab}`)
      await expect(page.getByRole('tab', { selected: true })).toBeVisible()
      await page.waitForTimeout(200)
      const h = await page.evaluate(() => document.documentElement.scrollHeight)
      expect(h, tab).toBeLessThanOrEqual(844 * 1.5)
    }
  })

  test('профиль: «Сохранить» и «Отмена» активны только после изменений; «Отмена» возвращает как было', async ({ page, db }) => {
    await fakeSupabase(page, db)
    await page.goto('settings#profile')
    const save = page.getByRole('button', { name: 'Сохранить' })
    const cancel = page.getByRole('button', { name: 'Отмена' })
    await expect(save).toBeDisabled()
    await expect(cancel).toBeDisabled()
    const balance = page.getByLabel('Стартовый депозит, $')
    const before = await balance.inputValue()
    await balance.fill('12345')
    await expect(save).toBeEnabled()
    await cancel.click()
    await expect(balance).toHaveValue(before)
    await expect(save).toBeDisabled()
    await balance.fill('777')
    await save.click()
    await expect(page.getByText('Сохранено')).toBeVisible()
  })

  test('ссылки ведут на нужную вкладку: окошко тарифа → «Тариф»', async ({ page, db }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 1024, 'пилюля тарифа у логотипа — на широком экране')
    db.usage = { plan: 'pro', trades_created: 3, trade_limit: null }
    await fakeSupabase(page, db)
    await page.goto('dashboard')
    await page.getByRole('button', { name: 'Тариф: Pro' }).click()
    await page.getByRole('dialog', { name: 'Тариф' }).getByRole('link', { name: 'Тариф в настройках' }).click()
    await expect(page).toHaveURL(/\/settings#plan$/)
    await expect(page.getByRole('tab', { name: 'Тариф' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('[data-payment-placeholder]')).toBeVisible()
  })
})

test.describe('оформление', () => {
  test('тема переключается (шапка, на узком телефоне — настройки) и запоминается после перезагрузки', async ({ page, db }) => {
    await fakeSupabase(page, db)
    await page.goto('dashboard')
    const html = page.locator('html')
    await expect(html).toHaveAttribute('data-theme', 'light') // светлая по умолчанию
    if ((page.viewportSize()?.width ?? 0) < 640) {
      // на узком телефоне в шапке только язык EN | RU, тема — в «Настройки → Оформление»
      await expect(page.getByRole('button', { name: 'Тёмная тема' }).filter({ visible: true })).toHaveCount(0)
      await page.goto('settings#appearance')
      await page.getByRole('radio', { name: 'Тёмная' }).click()
    } else {
      await page.getByRole('button', { name: 'Тёмная тема' }).filter({ visible: true }).first().click()
    }
    await expect(html).not.toHaveAttribute('data-theme', 'light')
    await page.reload()
    await expect(html).not.toHaveAttribute('data-theme', 'light')
    await page.goto('settings#appearance')
    await page.getByRole('radio', { name: 'Светлая' }).click()
    await expect(html).toHaveAttribute('data-theme', 'light')
  })

  test('главная: тема переключается в шапке, без вспышки после перезагрузки', async ({ page, db }) => {
    // уже 440px кнопки темы в шапке главной нет (там «Начать»), тема — в настройках
    if ((page.viewportSize()?.width ?? 0) < 440) await page.setViewportSize({ width: 440, height: 900 })
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

test('страница тарифов: Basic, Pro, Pro Plus; цены только за месяц; текущий тариф', async ({ page, db }) => {
  db.usage = { plan: 'pro', trades_created: 3, trade_limit: null }
  await fakeSupabase(page, db)
  // телефон: ссылка из настроек (тарифа в шапке нет); компьютер: пилюля тарифа у логотипа → окошко → «Сравнить тарифы»
  const phone = (page.viewportSize()?.width ?? 0) < 768
  await page.goto(phone ? 'settings#plan' : 'dashboard')
  if (phone) await page.getByRole('link', { name: 'Сравнить тарифы' }).click()
  else {
    await page.getByRole('button', { name: 'Тариф: Pro' }).click()
    await page.getByRole('dialog', { name: 'Тариф' }).getByRole('link', { name: 'Сравнить тарифы' }).click()
  }
  await expect(page.getByRole('heading', { name: 'Тарифы' })).toBeVisible()
  for (const name of ['Basic', 'Pro', 'Pro Plus']) await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  const head = page.locator('thead')
  await expect(head).toContainText('$10')
  await expect(head).toContainText('$15')
  await expect(page.getByText('Твой тариф')).toBeVisible()
  if (!phone) await expect(page.getByText('Всё автоматически')).toBeVisible()
  await expect(page.getByText('Сделок в месяц', { exact: true }).locator('visible=true')).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: 'без лимита' })).toContainText(/50.*без лимита.*без лимита/)
  await expect(page.getByText('Биржи по ключу, Hyperliquid по адресу').locator('visible=true')).toBeVisible()
  // оплаты за год пока нет: ни переключателя «Месяц / Год», ни годовых цен, ни «цены основателя»
  await expect(page.getByRole('radio', { name: /^(Месяц|Год)/ })).toHaveCount(0)
  await expect(page.getByText(/в год|основател/)).toHaveCount(0)
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
  // последняя сделка (i = 11) — победа, справа; первая из десяти (i = 2) — тоже победа, слева; подпись направления
  await expect(form.locator('li').last()).toHaveAttribute('aria-label', 'Победа')
  await expect(form.locator('li').nth(1)).toHaveAttribute('aria-label', 'Поражение') // i = 3
  await expect(form.getByText('старые → новые')).toBeVisible()
  // все 10 — в одну строку на любой ширине
  for (const width of [320, 390, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 })
    const tops = await form.locator('li').evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().top))).size)
    expect(tops, `ширина ${width}`).toBe(1)
  }
})

test('палитра в «Настройки → Оформление» на Basic: три бесплатные, остальные под замком', async ({ page, db }) => {
  await fakeSupabase(page, db)
  await page.goto('settings#appearance')
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
  await page.goto('settings#appearance')
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

test('пробный Pro Plus: в окошке тарифа у логотипа — сколько дней осталось, за 2 дня — плашка на дашборде', async ({ page, db }) => {
  db.usage = { plan: 'pro_plus', trades_created: 3, trade_limit: null }
  db.planTrial = true
  db.planUntil = new Date(Date.now() + 1.5 * 86_400_000).toISOString()
  db.trades = [makeTrade(1, { pnl: 50 })]
  await fakeSupabase(page, db)
  await page.goto('dashboard')
  const banner = page.locator('[data-plan-ending]')
  await expect(banner).toContainText('Пробный Pro Plus закончится через 2 дня.')
  await expect(banner.getByRole('link', { name: 'Тарифы' })).toBeVisible()
  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    // тариф — пилюля у логотипа; окошко показывает срок и три тарифа на выбор
    await page.getByRole('button', { name: 'Тариф: Pro Plus' }).click()
    const menu = page.getByRole('dialog', { name: 'Тариф' })
    await expect(menu.locator('[data-plan-term]')).toContainText('Pro Plus — пробный, осталось 2 дня')
    await expect(menu.getByText('Твой тариф')).toBeVisible()
    await expect(menu.getByRole('link', { name: /^Pro \$10/ })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
  }
})

test('Pro со сроком: «Pro до …», за 3 дня — плашка «Продлить»; раньше плашки нет', async ({ page, db }) => {
  db.usage = { plan: 'pro', trades_created: 3, trade_limit: null }
  db.planUntil = new Date(Date.now() + 10 * 86_400_000).toISOString()
  db.trades = [makeTrade(1, { pnl: 50 })]
  await fakeSupabase(page, db)
  await page.goto('settings#plan')
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
  const save = page.locator('button[data-state]').filter({ visible: true }) // на телефоне — в заголовке, на компьютере — в нижней полосе
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
  await expect(page.locator('button[data-state]').filter({ visible: true })).toHaveAttribute('data-state', 'idle')
  await expect(page).toHaveURL(/\/trades\/new$/)
})

test('тарифы на главной: вперёд выходит карточка под мышкой, без мышки — Pro Plus', async ({ page, db, isMobile }) => {
  test.skip(isMobile, 'на телефоне карточки друг под другом, без наведения')
  await fakeSupabase(page, db, { signedIn: false })
  await page.goto('')
  const card = (id: string) => page.locator(`[data-plan="${id}"]`)
  await card('pro_plus').scrollIntoViewIfNeeded()
  await expect(card('pro_plus')).toHaveAttribute('data-pos', 'active')
  await expect(card('free')).toHaveAttribute('data-pos', 'before')
  await card('free').hover()
  await expect(card('free')).toHaveAttribute('data-pos', 'active')
  await expect(card('pro')).toHaveAttribute('data-pos', 'after')
  await expect(card('pro_plus')).toHaveAttribute('data-pos', 'after')
  // у карточки впереди — главная кнопка
  await expect(card('free').getByRole('link')).toHaveClass(/bg-primary/)
  await page.mouse.move(2, 2)
  await expect(card('pro_plus')).toHaveAttribute('data-pos', 'active')
  // оплаты за год пока нет: тумблера нет, цены — в месяц
  await expect(page.getByRole('switch')).toHaveCount(0)
  await expect(card('pro_plus')).toContainText('$15')
})

test('тарифы на главной: карточки не заезжают друг на друга ни на одной ширине и ни при каком наведении', async ({ page, db, isMobile }) => {
  test.skip(isMobile, 'на телефоне карточки друг под другом')
  await fakeSupabase(page, db, { signedIn: false })
  const ids = ['free', 'pro', 'pro_plus']
  for (const width of [800, 1024, 1300, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('')
    await page.locator('[data-plan="pro_plus"]').scrollIntoViewIfNeeded()
    for (const hover of [null, ...ids]) {
      if (hover) await page.locator(`[data-plan="${hover}"]`).hover()
      else await page.mouse.move(1, 1)
      await page.waitForTimeout(800) // переход 0.6s
      const boxes = await Promise.all(ids.map(async (id) => (await page.locator(`[data-plan="${id}"]`).boundingBox())!))
      for (let i = 0; i < 2; i++) {
        const gap = boxes[i + 1].x - (boxes[i].x + boxes[i].width)
        expect(gap, `ширина ${width}, мышка на ${hover ?? 'ничём'}: зазор между ${ids[i]} и ${ids[i + 1]}`).toBeGreaterThanOrEqual(8)
      }
    }
  }
})

test('«Биржи»: файл — одной строкой под сеткой, история — в панели, файл можно бросить в любое место', async ({ page, db }) => {
  db.imports = [{ id: 'i1', exchange: 'bybit', filename: 'Bybit-UTA-Perp-TradeHistory.csv', rows_total: 103, rows_imported: 95, rows_skipped: 8, created_at: '2026-11-05T19:14:00Z' }]
  await fakeSupabase(page, db)
  await page.goto('import')
  const line = page.locator('[data-file-line]')
  await expect(line).toContainText('Перетащи файл с любой биржи в любое место страницы или выбери')
  // старых блоков нет: «Где взять файл» — в панели биржи, история — по кнопке
  await expect(page.getByText('Где взять файл на бирже?')).toHaveCount(0)
  await expect(page.locator('[data-history]')).toHaveCount(0)
  await line.getByRole('button', { name: /История импортов/ }).click()
  const panel = page.getByRole('dialog', { name: 'История импортов' })
  await expect(panel).toContainText('Bybit-UTA-Perp-TradeHistory.csv')
  await expect(panel.getByRole('button', { name: 'Отменить' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // файл тащат над страницей — рамка на весь экран
  const dt = await page.evaluateHandle(() => {
    const d = new DataTransfer()
    d.items.add(new File(['a'], 'x.csv', { type: 'text/csv' }))
    return d
  })
  await page.locator('[data-exchanges]').dispatchEvent('dragover', { dataTransfer: dt })
  await expect(page.locator('[data-drop-overlay]')).toBeVisible()
  await expect(page.locator('[data-drop-overlay]')).toContainText('Отпусти файл — биржу и колонки определим сами')
})

test('«Разбор»: сводка Long / Short наверху, строка-вывод, полоска PnL от середины', async ({ page, db }) => {
  db.listNames = ['Пробой уровня', 'Отбой', 'Вход без стопа', 'FOMO']
  db.trades = Array.from({ length: 12 }, (_, i) =>
    makeTrade(i, { setup_id: i % 2 ? 's1' : 's2', trade_mistakes: i % 3 === 0 ? [{ tag_id: 's3' }] : [] }),
  )
  await fakeSupabase(page, db)
  await page.goto('analysis')
  const side = page.locator('[data-shot="side-summary"]')
  await expect(side).toContainText('сделок: 6')
  await expect(side).toContainText('Long')
  await expect(side).toContainText('Short')
  // сводка — в шапке страницы, выше таблиц
  const head = (await page.getByRole('heading', { name: 'Разбор сделок' }).boundingBox())!
  const sideBox = (await side.boundingBox())!
  const setups = (await page.getByRole('tablist', { name: 'Разрез' }).boundingBox())!
  expect(sideBox.y).toBeLessThan(setups.y)
  expect(sideBox.y).toBeLessThan(head.y + 120)
  // makeTrade: прибыль 60+i, убыток −40−i; s1 «Пробой уровня» — нечётные i (+172), s2 «Отбой» — чётные (+178); ошибка s3 — i = 0,3,6,9 (−178)
  await expect(page.locator('[data-shot="insight"]')).toHaveText(/^Лучше всего работает: Отбой \(\+178,00\s\$\)\. Дороже всего обходится: Вход без стопа \(−178,00\s\$\)\.$/)
  // полоска: плюс — вправо от середины, минус — влево (на вкладке «Пары» есть и плюс, и минус)
  await page.getByRole('tab', { name: 'Пары' }).click()
  await expect(page.locator('[data-shot="analysis-table"] tbody')).toContainText('BTCUSDT')
  const bars = page.locator('[data-bar] i:last-child')
  const cls = await bars.evaluateAll((els) => els.map((e) => e.className))
  expect(cls.some((c) => c.includes('left-1/2') && c.includes('bg-up'))).toBe(true)
  expect(cls.some((c) => c.includes('right-1/2') && c.includes('bg-down'))).toBe(true)
})

test('«Разбор»: при малом числе сделок строки-вывода нет', async ({ page, db }) => {
  db.trades = Array.from({ length: 4 }, (_, i) => makeTrade(i))
  await fakeSupabase(page, db)
  await page.goto('analysis')
  await expect(page.locator('[data-shot="side-summary"]')).toBeVisible()
  await expect(page.locator('[data-shot="insight"]')).toHaveCount(0)
})

test('настройки: «Светлая» первой, оплата — «скоро» и дата пробного периода, удаление — красный контур', async ({ page, db }) => {
  db.planTrial = true
  db.planUntil = new Date(Date.now() + 5 * 86_400_000).toISOString()
  db.usage = { plan: 'pro_plus', trades_created: 3, trade_limit: null }
  await fakeSupabase(page, db)
  await page.goto('settings#appearance')
  const theme = page.getByRole('radiogroup', { name: 'Тема' })
  await expect(theme.getByRole('radio').first()).toHaveText('Светлая')
  await page.getByRole('tab', { name: 'Тариф' }).click()
  await expect(page).toHaveURL(/\/settings#plan$/)
  const pay = page.locator('[data-payment-placeholder]')
  await expect(pay).toContainText('Оплата на сайте скоро появится.')
  await expect(pay).toContainText(/Сейчас у тебя пробный Pro Plus до \d{2}\.\d{2}\.\d{4}\./)
  await expect(page.getByText(/владелец/)).toHaveCount(0)
  await page.getByRole('tab', { name: 'Данные' }).click()
  const del = page.getByRole('button', { name: 'Удалить аккаунт…' })
  await expect(del).toHaveClass(/border-down/)
  await expect(del).toHaveClass(/text-down/)
})

test('404: логотип, текст и кнопки «Статистика» / «На главную»', async ({ page, db }) => {
  await fakeSupabase(page, db)
  await page.goto('no-such-page')
  await expect(page.getByRole('heading', { name: 'Страница не найдена' })).toBeVisible()
  await expect(page.getByText('Такой страницы нет')).toBeVisible()
  await expect(page.getByRole('link', { name: 'На главную' })).toHaveAttribute('href', /\/welcome$/)
  await page.getByRole('link', { name: 'Статистика' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
})

test('404 для гостя: только «На главную»', async ({ page, db }) => {
  await fakeSupabase(page, db, { signedIn: false })
  await page.goto('no-such-page')
  await expect(page.getByRole('link', { name: 'Статистика' })).toHaveCount(0)
  await page.getByRole('link', { name: 'На главную' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Дневник сделок')
})

test('«Топ ошибок»: «Ср. убыток» и «Убытки» без колонки PnL, полоска справа налево', async ({ page, db, isMobile }) => {
  db.listNames = ['Пробой', 'Отбой', 'Вход без стопа', 'FOMO']
  // s3: три убыточные сделки −100, −200, −300 и одна прибыльная → убытки −600, ср. убыток −600 / 4 = −150; s4: одна −50
  db.trades = [
    makeTrade(0, { pnl: -100, trade_mistakes: [{ tag_id: 's3' }] }),
    makeTrade(1, { pnl: -200, trade_mistakes: [{ tag_id: 's3' }] }),
    makeTrade(2, { pnl: -300, trade_mistakes: [{ tag_id: 's3' }] }),
    makeTrade(3, { pnl: 80, trade_mistakes: [{ tag_id: 's3' }] }),
    makeTrade(4, { pnl: -50, trade_mistakes: [{ tag_id: 's4' }] }),
  ]
  await fakeSupabase(page, db)
  await page.goto('analysis')
  await page.getByRole('tab', { name: 'Ошибки' }).click()
  await expect(page).toHaveURL(/\?tab=mistakes$/)
  const card = page.getByRole('heading', { name: 'Ошибки' }).locator('..')
  await expect(card.locator('tbody tr')).toHaveCount(2)
  const heads = (await card.locator('thead th').filter({ visible: true }).allTextContents()).map((h) => h.replace(/[▲▼]/g, '').trim())
  expect(heads).toEqual(isMobile ? ['Название', 'Ср. убыток', 'Убытки'] : ['Название', 'Сделок', 'Ср. убыток', 'Убытки'])
  const first = card.locator('tbody tr').first()
  await expect(first).toContainText('Вход без стопа')
  await expect(first.locator('[data-money]').nth(0)).toHaveText(/−150,00\s\$/)
  await expect(first.locator('[data-money]').nth(1)).toHaveText(/−600,00\s\$/)
  // полоска: красная, от правого края; у самой дорогой ошибки — на всю ширину трека, у второй — 50 / 600
  const widths = await card.locator('[data-bar="loss"] i').evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect()
      const t = e.parentElement!.getBoundingClientRect()
      return { cls: e.className, share: Math.round((r.width / t.width) * 100), right: Math.round(t.right - r.right) }
    }),
  )
  expect(widths.map((w) => w.share)).toEqual([100, 8])
  expect(widths.every((w) => w.cls.includes('bg-down') && w.right === 0)).toBe(true)
  // в остальных вкладках — по-прежнему от середины
  await page.getByRole('tab', { name: 'Пары' }).click()
  await expect(page.locator('[data-bar="true"] i.bg-down.right-1\\/2').first()).toBeAttached()
})

test.describe('«Статистика»: сравнение с прошлым периодом, последние сделки, итог PnL по дням', () => {
  const at = (d: string) => new Date(`${d}T12:00:00Z`).toISOString()
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-12T12:00:00Z'))
  })

  test('«Месяц» с данными за октябрь — плашки «к октябрю» по смыслу', async ({ page, db }) => {
    // ноябрь: +300, −100 (PnL +200, винрейт 50 %, PF 3); октябрь: +100, −200, +50 (PnL −50, винрейт 67 %, PF 0,75)
    db.trades = [
      makeTrade(0, { entry_at: at('2026-11-03'), exit_at: at('2026-11-03'), pnl: 300 }),
      makeTrade(1, { entry_at: at('2026-11-05'), exit_at: at('2026-11-05'), pnl: -100 }),
      makeTrade(2, { entry_at: at('2026-10-06'), exit_at: at('2026-10-06'), pnl: 100 }),
      makeTrade(3, { entry_at: at('2026-10-08'), exit_at: at('2026-10-08'), pnl: -200 }),
      makeTrade(4, { entry_at: at('2026-10-10'), exit_at: at('2026-10-10'), pnl: 50 }),
    ]
    await fakeSupabase(page, db)
    await page.goto('dashboard')
    // «Всё время» — без сравнения
    await expect(page.getByText('Реализованный PnL')).toBeVisible()
    await expect(page.locator('[data-delta]')).toHaveCount(0)
    await page.getByRole('radio', { name: 'Месяц' }).click()
    const kpi = page.locator('[data-shot="kpi"]')
    await expect(kpi.locator('[data-delta]').first()).toHaveText(/▲\s*\+250\s\$ к октябрю/)
    await expect(kpi.locator('[data-delta]').nth(1)).toHaveText(/▼\s*−16,7 п\.п\. к октябрю/)
    await expect(kpi.locator('[data-delta]').nth(2)).toHaveText(/▲\s*было 0,75/)
    await expect(kpi.locator('[data-delta="up"]').first()).toHaveClass(/text-up/)
    await expect(kpi.locator('[data-delta="down"]').first()).toHaveClass(/text-down/)
    // итог периода в шапке «PnL по дням»
    await expect(page.locator('[data-shot="period-total"]')).toHaveText(/\+200,00\s\$/)
  })

  test('нет сделок за прошлый период — сравнения нет', async ({ page, db }) => {
    db.trades = [makeTrade(0, { entry_at: at('2026-11-03'), exit_at: at('2026-11-03'), pnl: 300 })]
    await fakeSupabase(page, db)
    await page.goto('dashboard')
    await page.getByRole('radio', { name: 'Месяц' }).click()
    await expect(page.getByText('+300,00 $').first()).toBeVisible()
    await expect(page.locator('[data-delta]')).toHaveCount(0)
  })

  test('«Последние сделки» — 5 строк-ссылок, новые сверху, «Все сделки →»; винрейт дней — квадратики', async ({ page, db }) => {
    db.trades = Array.from({ length: 8 }, (_, i) => makeTrade(i))
    await fakeSupabase(page, db)
    await page.goto('dashboard')
    const recent = page.locator('[data-shot="recent"]')
    await expect(recent.locator('li')).toHaveCount(5)
    await expect(recent.locator('li a').first()).toHaveAttribute('href', /\/trades\/00000000-0000-0000-0000-000000000007$/)
    await expect(recent.getByRole('link', { name: 'Все сделки →' })).toHaveAttribute('href', /\/trades$/)
    await expect(page.locator('[data-shot="day-form"] li')).toHaveCount(7)
  })
})

test.describe('«Сделки»: быстрые фильтры, сортировка, «В сделке», массовые действия', () => {
  const at = (d: string, h: number) => new Date(`${d}T${String(h).padStart(2, '0')}:00:00Z`).toISOString()
  const seed = (db: { trades: Record<string, unknown>[]; listNames?: string[] }) => {
    db.listNames = ['Пробой', 'Отбой', 'FOMO']
    db.trades = [
      makeTrade(0, { pnl: 120, side: 'long', symbol: 'BTCUSDT', entry_at: at('2026-11-01', 10), exit_at: at('2026-11-01', 10).replace('10:00', '10:45') }),
      makeTrade(1, { pnl: -60, side: 'short', symbol: 'ETHUSDT', entry_at: at('2026-11-02', 9), exit_at: at('2026-11-02', 13).replace('13:00', '13:12') }),
      makeTrade(2, { pnl: 300, side: 'long', symbol: 'SOLUSDT', entry_at: at('2026-11-03', 8), exit_at: at('2026-11-06', 10) }),
      makeTrade(3, { pnl: -10, side: 'short', symbol: 'DOGEUSDT', entry_at: at('2026-11-04', 8), exit_at: at('2026-11-04', 9) }),
    ]
  }

  test('сортировка по PnL: клик по заголовку, повторный — обратный порядок, aria-sort', async ({ page, db, isMobile }) => {
    test.skip(isMobile, 'на телефоне — выбор «Сортировка» вместо заголовков')
    seed(db)
    await fakeSupabase(page, db)
    await page.goto('trades')
    const pnls = () => page.locator('tbody td[data-pnl]').allTextContents()
    // по умолчанию — дата, новые сверху
    await expect(page.locator('th[aria-sort="descending"]')).toContainText('Дата входа')
    await page.getByRole('button', { name: 'Сортировать: PnL' }).click()
    await expect(page.locator('th[aria-sort="descending"]')).toContainText('PnL')
    expect((await pnls()).map((x) => x.replace(/\s/g, ''))).toEqual(['+300,00$', '+120,00$', '−10,00$', '−60,00$'])
    await expect(page).toHaveURL(/sort=pnl&dir=desc/)
    await page.getByRole('button', { name: 'Сортировать: PnL' }).click()
    await expect(page.locator('th[aria-sort="ascending"]')).toContainText('PnL')
    expect((await pnls())[0].replace(/\s/g, '')).toBe('−60,00$')
    // «В сделке»: 45 мин, 4 ч 12 мин, 3 д 2 ч; колонки «Биржа» нет — биржа одна
    await expect(page.locator('td[data-duration]')).toHaveText(['4 ч 12 мин', '1 ч', '45 мин', '3 д 2 ч'])
    await expect(page.getByRole('columnheader', { name: 'Биржа' })).toHaveCount(0)
  })

  test('быстрые фильтры: Long и «Плюс» — в адресе, ссылка открывает тот же вид; «Фильтры» с числом', async ({ page, db }) => {
    seed(db)
    await fakeSupabase(page, db)
    await page.goto('trades')
    await page.getByRole('button', { name: 'Long', exact: true }).click()
    await expect(page).toHaveURL(/side=long/)
    await expect(page.getByText('Сделок: 2')).toBeVisible()
    await page.getByRole('button', { name: 'Плюс', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Плюс', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page).toHaveURL(/side=long&result=win/)
    await expect(page.getByText('Сделок: 2')).toBeVisible()
    await page.getByRole('button', { name: 'Плюс', exact: true }).click()
    await page.getByRole('button', { name: 'Минус', exact: true }).click()
    await expect(page.getByText('Под фильтры ничего не подходит.')).toBeVisible()
    // ссылка с фильтрами открывает тот же вид, скрытые фильтры — с числом на кнопке
    await page.goto('trades?side=short&mistake=s3&q=eth')
    await expect(page.getByRole('button', { name: 'Short', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('searchbox', { name: 'Поиск по паре' })).toHaveValue('eth')
    await expect(page.getByRole('button', { name: /^Фильтры/ }).locator('[data-count]')).toHaveText('1')
  })

  test('массовые действия: назначить сетап выбранным и удалить с подтверждением', async ({ page, db }) => {
    seed(db)
    await fakeSupabase(page, db)
    await page.goto('trades')
    await page.getByRole('checkbox', { name: /Выбрать сделку BTCUSDT/ }).check()
    await page.getByRole('checkbox', { name: /Выбрать сделку SOLUSDT/ }).check()
    const bar = page.getByRole('region', { name: 'Выбрано: 2' })
    await expect(bar).toBeVisible()
    await bar.getByRole('combobox', { name: 'Назначить сетап' }).selectOption({ label: 'FOMO' })
    await bar.getByRole('button', { name: 'Назначить' }).click()
    await expect(page.getByText('Сетап назначен: 2')).toBeVisible()
    const patch = db.tradeWrites!.find((w) => w.method === 'PATCH')!
    expect(patch.body).toEqual({ setup_id: 's3' })
    expect(patch.ids.sort()).toEqual(['00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000002'])
    // удалить: окно подтверждения (не confirm()), «Отмена» ничего не трогает
    await page.getByRole('checkbox', { name: /Выбрать сделку ETHUSDT/ }).check()
    await page.getByRole('region', { name: 'Выбрано: 1' }).getByRole('button', { name: 'Удалить' }).click()
    const dialog = page.getByRole('dialog', { name: 'Удалить сделки?' })
    await expect(dialog).toContainText('Будет удалено сделок: 1')
    await dialog.getByRole('button', { name: 'Отмена' }).click()
    expect(db.tradeWrites!.some((w) => w.method === 'DELETE')).toBe(false)
    await page.getByRole('region', { name: 'Выбрано: 1' }).getByRole('button', { name: 'Удалить' }).click()
    await dialog.getByRole('button', { name: 'Удалить 1' }).click()
    await expect(page.getByText('Удалено сделок: 1')).toBeVisible()
    await expect.poll(() => db.tradeWrites?.find((w) => w.method === 'DELETE')?.ids).toEqual(['00000000-0000-0000-0000-000000000001'])
    await expect(page.getByText('Сделок: 3')).toBeVisible()
  })

  test('две биржи — колонка «Биржа» есть', async ({ page, db, isMobile }) => {
    test.skip(isMobile, 'на телефоне биржа — в подписи карточки')
    seed(db)
    db.trades[1].exchange = 'okx'
    await fakeSupabase(page, db)
    await page.goto('trades')
    await expect(page.getByRole('columnheader', { name: 'Биржа' })).toBeVisible()
  })
})

test.describe('«Разбор»: вкладки, «Итого», сортировка', () => {
  const at = (iso: string) => new Date(iso).toISOString()
  const seed = (db: { trades: Record<string, unknown>[]; listNames?: string[] }) => {
    db.listNames = ['Пробой', 'Отбой']
    db.trades = [
      // Москва (часовой пояс профиля): 03:30 → 03–06, 05:10 → 03–06, 23:00 → 21–24
      makeTrade(0, { pnl: 100, symbol: 'BTCUSDT', setup_id: 's1', leverage: 2, entry_at: at('2026-11-01T00:30:00Z'), exit_at: at('2026-11-01T01:30:00Z') }),
      makeTrade(1, { pnl: -40, symbol: 'ETHUSDT', setup_id: 's1', leverage: 8, entry_at: at('2026-11-01T02:10:00Z'), exit_at: at('2026-11-01T03:10:00Z') }),
      makeTrade(2, { pnl: 60, symbol: 'ETHUSDT', setup_id: 's2', leverage: 50, entry_at: at('2026-11-01T20:00:00Z'), exit_at: at('2026-11-01T21:00:00Z') }),
    ]
  }

  test('вкладка в адресе, строка «Итого», сортировка по винрейту', async ({ page, db, isMobile }) => {
    seed(db)
    await fakeSupabase(page, db)
    await page.goto('analysis')
    await page.getByRole('tab', { name: 'Пары' }).click()
    await expect(page).toHaveURL(/\?tab=pairs$/)
    await expect(page.getByRole('tab', { name: 'Пары' })).toHaveAttribute('aria-selected', 'true')
    const table = page.locator('[data-shot="analysis-table"]')
    // по умолчанию — по PnL: BTC (+100) выше ETH (+20)
    await expect(table.locator('tbody tr').first()).toContainText('BTCUSDT')
    await expect(table.locator('tfoot tr[data-total]')).toContainText('Итого')
    await expect(table.locator('tfoot [data-money]')).toHaveText(/\+120,00\s\$/)
    await table.getByRole('button', { name: 'Сортировать: Винрейт' }).click()
    await expect(table.locator('th[aria-sort="descending"]')).toContainText('Винрейт')
    await expect(table.locator('tbody tr').first()).toContainText('BTCUSDT')
    await table.getByRole('button', { name: 'Сортировать: Винрейт' }).click()
    await expect(table.locator('tbody tr').first()).toContainText('ETHUSDT')
    if (!isMobile) {
      await table.getByRole('button', { name: 'Сортировать: Сделок' }).click()
      await expect(table.locator('tbody tr').first()).toContainText('ETHUSDT')
    }
    // ссылка с вкладкой открывает её же
    await page.goto('analysis?tab=emotions')
    await expect(page.getByRole('tab', { name: 'Эмоции' })).toHaveAttribute('aria-selected', 'true')
  })

  test('лента сделок над таблицей: клик по строке оставляет её сделки, карточка ведёт на сделку', async ({ page, db }) => {
    seed(db)
    await fakeSupabase(page, db)
    await page.goto('analysis?tab=pairs')
    const strip = page.locator('[data-strip]')
    await expect(strip.locator('[data-trade-card]')).toHaveCount(3)
    await page.locator('[data-row="ETHUSDT"]').click()
    await expect(page.locator('[data-row="ETHUSDT"]')).toHaveAttribute('aria-selected', 'true')
    await expect(strip.locator('[data-trade-card]')).toHaveCount(2)
    await expect(page.locator('[data-shot="group-trades"] h2')).toContainText('ETHUSDT')
    // повторный клик — снова все сделки
    await page.locator('[data-row="ETHUSDT"]').click()
    await expect(strip.locator('[data-trade-card]')).toHaveCount(3)
    await strip.locator('[data-trade-card]').first().click()
    await expect(page).toHaveURL(/\/trades\/00000000-0000-0000-0000-00000000000\d$/)
  })

  test('все сделки «Без сетапа»: вместо таблицы из одной строки — объяснение и кнопка', async ({ page, db }) => {
    seed(db)
    db.trades.forEach((tr) => (tr.setup_id = null))
    await fakeSupabase(page, db)
    await page.goto('analysis')
    await expect(page.locator('[data-shot="analysis-empty"]')).toContainText('Сделки ещё не разделены по сетапам')
    await expect(page.locator('[data-shot="analysis-table"]')).toHaveCount(0)
    await expect(page.locator('[data-strip] [data-trade-card]')).toHaveCount(3)
    await page.getByRole('button', { name: 'Назначить сетап списком' }).click()
    await expect(page).toHaveURL(/\/trades$/)
  })

  test('вкладки — капсулой: только Сетапы, Ошибки, Пары, Эмоции; старые ссылки на «Время суток» и «Плечо» открывают Сетапы', async ({ page, db }) => {
    seed(db)
    await fakeSupabase(page, db)
    await page.goto('analysis')
    const tabs = page.getByRole('tab')
    await expect(tabs).toHaveCount(4)
    // у вкладки — число групп: «Пары 2» (BTCUSDT, ETHUSDT)
    if ((page.viewportSize()?.width ?? 0) >= 640) await expect(page.getByRole('tab', { name: /Пары/ })).toContainText('2')
    // все четыре помещаются без прокрутки (и на телефоне)
    expect(await page.locator('[data-shot="analysis-tabs"]').evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    for (const old of ['time', 'leverage']) {
      await page.goto(`analysis?tab=${old}`)
      await expect(page.getByRole('tab', { name: /Сетапы/ })).toHaveAttribute('aria-selected', 'true')
    }
    // капсула по центру страницы (±4px)
    const box = (await page.locator('[data-shot="analysis-tabs"]').boundingBox())!
    const vw = page.viewportSize()!.width
    if (box.width < vw - 40) expect(Math.abs(box.x + box.width / 2 - vw / 2)).toBeLessThan(40)
  })
})

test('верхнее меню — капсула строго по центру на любой ширине от планшета; активный пункт отмечен, подписи — с 1280px', async ({ page, db }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 768, 'на телефоне — нижнее меню')
  db.isAdmin = true
  await fakeSupabase(page, db)
  await page.goto('calendar')
  const capsule = page.locator('[data-shot="nav-capsule"]')
  await expect(capsule).toBeVisible()
  await expect(page.locator('aside')).toHaveCount(0) // левой колонки больше нет
  for (const width of [768, 820, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 })
    const box = (await capsule.boundingBox())!
    expect(Math.abs(box.x + box.width / 2 - width / 2), `ширина ${width}`).toBeLessThanOrEqual(2)
    // ничего не наезжает: капсула целиком внутри экрана, правый блок — правее капсулы
    const right = (await page.locator('[data-shot="topnav"]').getByRole('button', { name: 'Выйти' }).boundingBox())!
    expect(right.x, `ширина ${width}`).toBeGreaterThan(box.x + box.width)
    const label = capsule.getByRole('link', { name: 'Календарь' })
    await expect(label).toHaveAttribute('aria-current', 'page')
    // с 1280px — подпись, раньше — только значок (подпись — всплывающая при наведении)
    const caption = label.locator('span:not([role=tooltip])', { hasText: 'Календарь' })
    if (width >= 1280) {
      await expect(caption).toBeVisible()
      await expect(label.locator('svg')).toBeHidden()
    } else {
      await expect(label.locator('svg')).toBeVisible()
      await expect(caption).toBeHidden()
    }
  }
  await capsule.getByRole('link', { name: 'Сделки' }).click()
  await expect(page).toHaveURL(/\/trades$/)
})

test.describe('скриншот графика из буфера обмена', () => {
  /** картинка в настоящий буфер — как после «Копировать» в TradingView или Ножницах */
  const copyImage = (page: import('@playwright/test').Page) =>
    page.evaluate(async () => {
      const c = document.createElement('canvas')
      c.width = 64
      c.height = 40
      c.getContext('2d')!.fillRect(0, 0, 64, 40)
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'))
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    })

  test.beforeEach(async ({ context, isMobile }) => {
    test.skip(isMobile, 'Ctrl+V и чтение буфера — на компьютере')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  })

  test('Ctrl+V в любом месте формы добавляет скриншот', async ({ page, db }) => {
    await fakeSupabase(page, db)
    await page.goto('trades/new')
    await expect(page.locator('[data-shot="screenshot-drop"]')).toContainText('вставить скриншот')
    await copyImage(page)
    await page.locator('body').click({ position: { x: 5, y: 300 } })
    await page.keyboard.press('Control+V')
    await expect(page.getByText('новый')).toBeVisible()
  })

  test('кнопка «Вставить из буфера»: есть картинка — добавляет, нет — подсказывает', async ({ page, db }) => {
    await fakeSupabase(page, db)
    await page.goto('trades/new')
    await page.evaluate(() => navigator.clipboard.writeText('не картинка'))
    await page.getByRole('button', { name: 'Вставить из буфера' }).click()
    await expect(page.getByRole('status')).toContainText('В буфере нет картинки')
    await copyImage(page)
    await page.getByRole('button', { name: 'Вставить из буфера' }).click()
    await expect(page.getByText('новый')).toBeVisible()
    await expect(page.getByRole('status')).toHaveCount(0)
  })
})

test('сделка из файла: у плеча подсказка «в файле биржи плеча нет», у ручной — нет', async ({ page, db }) => {
  db.trades = [makeTrade(1, { source: 'import', leverage: 1 }), makeTrade(2, { source: 'manual', leverage: 1 })]
  await fakeSupabase(page, db)
  await page.goto(`trades/${db.trades[0].id}`)
  await expect(page.getByText('В файле биржи плеча нет')).toBeVisible()
  await page.goto(`trades/${db.trades[1].id}`)
  await expect(page.getByRole('button', { name: 'Сохранить сделку' })).toBeVisible()
  await expect(page.getByText('В файле биржи плеча нет')).toHaveCount(0)
})

test('язык писем: вошедший сменил язык на английский — он запоминается в аккаунте', async ({ page, db }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await fakeSupabase(page, db)
  await page.goto('dashboard')
  // сайт на русском, а в аккаунте языка ещё нет — записывает ru
  await expect.poll(() => db.authCalls?.filter((c) => c.path === '/auth/v1/user').map((c) => (c.body as { data?: { lang?: string } }).data?.lang)).toContain('ru')
  await page.getByRole('radio', { name: 'EN' }).first().click()
  await expect.poll(() => db.authCalls?.filter((c) => c.path === '/auth/v1/user').map((c) => (c.body as { data?: { lang?: string } }).data?.lang)).toContain('en')
})
