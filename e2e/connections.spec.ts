/** Подключения бирж: Hyperliquid по адресу кошелька, Bybit и OKX по ключу «только чтение» (у OKX — с кодовой фразой) */
import type { Page } from '@playwright/test'
import { test, expect, fakeSupabase, makeTrade } from './fixtures'

/** Карточки подключений с 17.11.2026 — в панели биржи: нажатие на биржу в сетке → «Подключено» */
async function openConn(page: Page, ex: string) {
  await page.locator(`[data-exchanges] [data-exchange="${ex}"]`).click()
  return page.locator(`[data-panel-manage] [data-conn="${ex}"]`)
}

const WALLET = '0xAbCdEf0123456789abcdef0123456789ABCDEF01'

test('Hyperliquid: подключение кошелька и первая синхронизация', async ({ page, db }) => {
  db.usage = { plan: 'pro_plus', trades_created: 3, trade_limit: null }
  await fakeSupabase(page, db)
  const t0 = Date.UTC(2026, 10, 1, 10)
  const hlBodies: unknown[] = []
  await page.route('https://api.hyperliquid.xyz/**', async (route) => {
    hlBodies.push(JSON.parse(route.request().postData() ?? 'null'))
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([
        { coin: 'BTC', px: '60000', sz: '0.1', side: 'B', time: t0, dir: 'Open Long', fee: '1.2', feeToken: 'USDC', oid: 1, tid: 1, startPosition: '0' },
        { coin: 'BTC', px: '61000', sz: '0.1', side: 'A', time: t0 + 3_600_000, dir: 'Close Long', fee: '1.2', feeToken: 'USDC', oid: 2, tid: 2, startPosition: '0.1' },
      ]),
    })
  })
  await page.goto('import')
  await page.getByRole('button', { name: '+ Подключить' }).click()
  await page.getByLabel('Биржа').first().selectOption('hyperliquid')
  await page.getByLabel('Адрес кошелька').fill(WALLET)
  await page.getByRole('button', { name: 'Подключить', exact: true }).click()

  await expect(page.getByText('Hyperliquid подключена')).toBeVisible()
  await expect.poll(() => db.inserted.filter((x) => x.table === 'trades').length).toBe(1)
  const rows = db.inserted.find((x) => x.table === 'trades')!.body as Record<string, unknown>[]
  expect(rows[0]).toMatchObject({ exchange: 'hyperliquid', symbol: 'BTCUSDC', side: 'long', source: 'api', entry_price: 60000, exit_price: 61000 })
  expect(hlBodies[0]).toMatchObject({ type: 'userFillsByTime', user: WALLET.toLowerCase() })
  // после синхронизации запомнили, с какого места продолжать
  await expect.poll(() => db.connCalls?.find((c) => c.fn === 'touch_exchange_connection')?.body.p_cursor).toBe(new Date(t0 + 3_600_001).toISOString())
  await page.keyboard.press('Escape')
  const hl = await openConn(page, 'hyperliquid')
  await expect(hl).toHaveAttribute('data-status', 'ok')
  await expect(hl).toContainText(/Обновлено (только что|.+ назад)/)
})

test('один аккаунт биржи — одно подключение: тот же аккаунт Bybit другим ключом не подключить (деньги посчитались бы дважды)', async ({ page, db }) => {
  db.usage = { plan: 'pro_plus', trades_created: 3, trade_limit: null }
  db.connections = [{ id: 'c1', exchange: 'bybit', label: 'Основной', api_key: 'firstkey1234', last_sync_at: new Date().toISOString(), cursor_at: null, last_error: null, key_expires_at: null, created_at: '2026-11-01T10:00:00Z', account_uid: '1001' }]
  db.bybitUid = 1001
  await fakeSupabase(page, db)
  await page.goto('import')
  await page.getByRole('button', { name: '+ Подключить' }).click()
  await page.getByLabel('API Key').fill('SecondKey9876')
  await page.getByLabel('API Secret').fill('SuperSecret123456')
  await page.getByRole('button', { name: 'Подключить', exact: true }).click()
  await expect(page.getByText('Этот аккаунт биржи уже подключён')).toBeVisible()
  expect(db.connCalls?.map((c) => c.fn)).toEqual(['add_exchange_connection', 'exchange-proxy', 'set_connection_account', 'delete_exchange_connection'])
  expect(db.connections?.map((c) => c.api_key)).toEqual(['firstkey1234'])
  // другой аккаунт (другой номер) — подключается
  db.bybitUid = 2002
  await page.getByLabel('API Key').fill('ThirdKey55555')
  await page.getByRole('button', { name: 'Подключить', exact: true }).click()
  await expect.poll(() => db.connections?.[1]?.account_uid).toBe('2002')
  expect(db.connections?.map((c) => c.api_key)).toEqual(['firstkey1234', 'thirdkey55555'])
})

test('Bybit: ключ с правом торговли не принимаем', async ({ page, db }) => {
  db.usage = { plan: 'pro_plus', trades_created: 3, trade_limit: null }
  db.bybitReadOnly = 0
  await fakeSupabase(page, db)
  await page.goto('import')
  await page.getByRole('button', { name: '+ Подключить' }).click()
  await page.getByLabel('API Key').fill('AbCdEf123456')
  await page.getByLabel('API Secret').fill('SuperSecret123456')
  await page.getByRole('button', { name: 'Подключить', exact: true }).click()
  await expect(page.getByText('Этот ключ может торговать')).toBeVisible()
  expect(db.connCalls?.map((c) => c.fn)).toEqual(['add_exchange_connection', 'exchange-proxy', 'delete_exchange_connection'])
  expect(db.connections).toEqual([])
})

test('Bybit: ключ «только чтение» — закрытые позиции загружаются', async ({ page, db }) => {
  db.usage = { plan: 'pro_plus', trades_created: 3, trade_limit: null }
  await fakeSupabase(page, db)
  await page.goto('import')
  await page.getByRole('button', { name: '+ Подключить' }).click()
  await page.getByLabel('API Key').fill('AbCdEf123456')
  await page.getByLabel('API Secret').fill('SuperSecret123456')
  await page.getByRole('button', { name: 'Подключить', exact: true }).click()
  await expect(page.getByText('Bybit подключена')).toBeVisible()
  await expect.poll(() => db.inserted.filter((x) => x.table === 'trades').length, { timeout: 20_000 }).toBe(1)
  const rows = db.inserted.find((x) => x.table === 'trades')!.body as Record<string, unknown>[]
  expect(rows[0]).toMatchObject({ exchange: 'bybit', symbol: 'ETHUSDT', side: 'short', pnl: 98, external_id: 'o:bb-1', source: 'api' })
  // секрет в браузер больше не попадает: в запросах к серверной функции его нет
  for (const c of db.connCalls!.filter((x) => x.fn === 'exchange-proxy')) expect(JSON.stringify(c.body)).not.toContain('SuperSecret')
})

test('OKX: ключ с кодовой фразой — фраза уходит в базу, в серверную функцию — нет; позиции загружаются', async ({ page, db }) => {
  db.usage = { plan: 'pro_plus', trades_created: 3, trade_limit: null }
  await fakeSupabase(page, db)
  await page.goto('import')
  await page.getByRole('button', { name: '+ Подключить' }).click()
  await expect(page.getByLabel('Кодовая фраза (Passphrase)')).toHaveCount(0) // у Bybit фразы нет
  await page.getByLabel('Биржа').selectOption('okx')
  await expect(page.getByText('Европейский аккаунт (my.okx.com) тоже подходит')).toBeVisible()
  await page.getByLabel('API Key').fill('a1b2c3d4-0000-4000-8000-123456789abc')
  await page.getByLabel('API Secret').fill('ABCDEF0123456789ABCDEF0123456789')
  await page.getByLabel('Кодовая фраза (Passphrase)').fill('Фраза #1')
  await page.getByRole('button', { name: 'Подключить', exact: true }).click()
  await expect(page.getByText('OKX подключена')).toBeVisible()
  const add = db.connCalls!.find((c) => c.fn === 'add_exchange_connection')!
  expect(add.body).toMatchObject({ p_exchange: 'okx', p_passphrase: 'Фраза #1' })
  await expect.poll(() => db.inserted.filter((x) => x.table === 'trades').length, { timeout: 20_000 }).toBe(1)
  const rows = db.inserted.find((x) => x.table === 'trades')!.body as Record<string, unknown>[]
  expect(rows[0]).toMatchObject({ exchange: 'okx', symbol: 'BTCUSDT', side: 'long', pnl: 29.1, size_usd: 1800, source: 'api' })
  for (const c of db.connCalls!.filter((x) => x.fn === 'exchange-proxy')) {
    expect(JSON.stringify(c.body)).not.toContain('ABCDEF0123456789')
    expect(JSON.stringify(c.body)).not.toContain('Фраза')
  }
})

test('OKX: ключ с правом торговли не принимаем — подключение удаляется', async ({ page, db }) => {
  db.usage = { plan: 'pro_plus', trades_created: 3, trade_limit: null }
  db.okxPerm = 'read_only,trade'
  await fakeSupabase(page, db)
  await page.goto('import')
  await page.getByRole('button', { name: '+ Подключить' }).click()
  await page.getByLabel('Биржа').selectOption('okx')
  await page.getByLabel('API Key').fill('a1b2c3d4-0000-4000-8000-123456789abc')
  await page.getByLabel('API Secret').fill('ABCDEF0123456789ABCDEF0123456789')
  await page.getByLabel('Кодовая фраза (Passphrase)').fill('phrase')
  await page.getByRole('button', { name: 'Подключить', exact: true }).click()
  await expect(page.getByText('Этот ключ может торговать')).toBeVisible()
  expect(db.connCalls?.map((c) => c.fn)).toEqual(['add_exchange_connection', 'exchange-proxy', 'delete_exchange_connection'])
})

test('Pro Plus: синхронизация на сервере каждые 3 часа и предупреждение о сроке ключа Bybit', async ({ page, db }) => {
  db.usage = { plan: 'pro_plus', trades_created: 3, trade_limit: null }
  const soon = new Date(Date.now() + 5 * 86_400_000).toISOString()
  db.connections = [
    { id: 'c1', exchange: 'bybit', label: 'основной', api_key: 'AbCdEf123456', last_sync_at: new Date().toISOString(), cursor_at: new Date().toISOString(), last_error: null, key_expires_at: soon, created_at: '' },
  ]
  await fakeSupabase(page, db)
  await page.goto('import')
  await expect(page.getByText(/Сделки подтягиваются на сервере каждые 3 часа/)).toBeVisible()
  // срок ключа виден сразу — строкой под блоком; время следующей синхронизации — в панели биржи
  await expect(page.locator('[data-issue="bybit"]')).toContainText(/Ключ Bybit перестанет работать/)
  const tile = await openConn(page, 'bybit')
  await expect(tile.getByText(/следующее примерно через 2 ч (59|58) мин/)).toBeVisible()
})

test('Basic: подключений нет — строка про тарифы, демо Polymarket работает', async ({ page, db }) => {
  await fakeSupabase(page, db)
  await page.goto('import')
  await expect(page.getByText(/На Pro Plus — на сервере каждые 3 часа/)).toBeVisible()
  const upgrade = page.locator('[data-upgrade]').filter({ hasText: 'Подключения бирж — с Pro' })
  await expect(upgrade.first()).toBeVisible()
  await expect(upgrade.first().getByRole('link', { name: 'Тарифы' })).toBeVisible()
  await page.getByRole('button', { name: '+ Подключить' }).click()
  await expect(page.getByRole('button', { name: 'Подключить', exact: true })).toBeDisabled()
  await page.getByLabel('Биржа').first().selectOption('polymarket')
  await expect(page.getByRole('button', { name: 'Подключить', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: /Посмотреть пример/ }).click()
  await expect(page.getByRole('dialog', { name: 'Пример: Polymarket в дневнике' })).toBeVisible()
})

test('Pro: биржа или кошелёк — можно, Polymarket — нет, второе подключение — сверх лимита', async ({ page, db }) => {
  db.usage = { plan: 'pro', trades_created: 3, trade_limit: null }
  await fakeSupabase(page, db)
  await page.goto('import')
  await page.getByRole('button', { name: '+ Подключить' }).click()
  // по умолчанию выбрано первое доступное — Bybit
  await expect(page.getByLabel('Биржа').first()).toHaveValue('bybit')
  await expect(page.getByLabel('API Key')).toBeVisible()
  await page.getByLabel('Биржа').first().selectOption('polymarket')
  await expect(page.locator('[data-upgrade]').filter({ hasText: 'Polymarket — на Pro Plus.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Подключить', exact: true })).toBeDisabled()
  await page.getByLabel('Биржа').first().selectOption('hyperliquid')
  await page.getByLabel('Адрес кошелька').fill(WALLET)
  await page.getByRole('button', { name: 'Подключить', exact: true }).click()
  await expect(page.getByText('Hyperliquid подключена')).toBeVisible()
  // Hyperliquid в этом тесте не отвечает — синхронизация с ошибкой, подключение всё равно есть
  await expect(page.locator('[data-bridge]')).toHaveAttribute('data-stage', /done|syncError/)
  await page.keyboard.press('Escape') // закрыть панель
  await page.getByRole('button', { name: '+ Подключить' }).click()
  await expect(page.locator('[data-upgrade]').filter({ hasText: 'На Pro — одно подключение' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Подключить', exact: true })).toBeDisabled()
})

test('Pro: старое подключение Polymarket не удаляется, а стоит на паузе — «нужен Pro Plus»', async ({ page, db }) => {
  db.usage = { plan: 'pro', trades_created: 3, trade_limit: null }
  db.connections = [
    { id: 'c1', exchange: 'polymarket', label: 'pm', api_key: '0x9999999999999999999999999999999999999999', last_sync_at: null, cursor_at: null, last_error: null, created_at: '2026-11-01T10:00:00Z' },
  ]
  await fakeSupabase(page, db)
  await page.goto('import')
  // в блоке «Подключено» — «На паузе», подробности и «Обновить» (недоступно) — в панели биржи
  await expect(page.locator('[data-linked-orbit] [data-linked="polymarket"]')).toHaveAttribute('data-state', 'paused')
  const row = await openConn(page, 'polymarket')
  await expect(row).toHaveAttribute('data-status', 'paused')
  await expect(row.locator('[data-pill]')).toHaveText('На паузе')
  await expect(row.getByText('По тарифу не положено — нужен Pro Plus.')).toBeVisible()
  await expect(row.getByRole('button', { name: 'Обновить' })).toBeDisabled()
  // автосинхронизация его не трогает
  await page.waitForTimeout(500)
  expect(db.connCalls?.some((c) => c.fn === 'exchange-proxy') ?? false).toBe(false)
})

test('Polymarket: подключение по адресу — закрытые позиции становятся сделками с названием рынка', async ({ page, db }) => {
  db.usage = { plan: 'pro_plus', trades_created: 3, trade_limit: null }
  await fakeSupabase(page, db)
  await page.goto('import')
  await page.getByRole('button', { name: '+ Подключить' }).click()
  await page.getByLabel('Биржа').first().selectOption('polymarket')
  await expect(page.getByText(/Нужен адрес аккаунта Polymarket/)).toBeVisible()
  await page.getByLabel('Адрес кошелька').fill('0x9999999999999999999999999999999999999999')
  await page.getByRole('button', { name: 'Подключить', exact: true }).click()
  await expect(page.getByText('Polymarket подключена')).toBeVisible()
  await expect.poll(() => db.inserted.filter((x) => x.table === 'trades').length).toBe(1)
  const rows = db.inserted.find((x) => x.table === 'trades')!.body as Record<string, unknown>[]
  expect(rows[0]).toMatchObject({ exchange: 'polymarket', market_type: 'prediction', side: 'long', symbol: 'PM-ABCDEF01-YES', title: 'Will BTC hit 150k in 2026? — Yes', entry_price: 0.4, exit_price: 1, pnl: 60, source: 'api' })
  // запрос ушёл через серверную функцию, не напрямую
  expect(db.connCalls!.some((c) => c.fn === 'exchange-proxy' && c.body.path === '/v2/positions')).toBe(true)
})

test('Polymarket: демо без подключения — пример сделок, в дневник ничего не пишется', async ({ page, db }) => {
  await fakeSupabase(page, db)
  await page.goto('import')
  await page.getByRole('button', { name: '+ Подключить' }).click()
  await page.getByLabel('Биржа').first().selectOption('polymarket')
  await page.getByRole('button', { name: /Посмотреть пример/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Пример: Polymarket в дневнике' })
  await expect(dialog.getByText('Will BTC hit 150k in 2026? — Yes')).toBeVisible()
  await expect(dialog.getByText(/Сделок: 1, в плюс: 1 \(100%\)/)).toBeVisible()
  expect(db.connCalls!.find((c) => c.fn === 'exchange-proxy')?.body).toMatchObject({ demo: true, path: '/v2/positions' })
  expect(db.inserted.filter((x) => x.table === 'trades')).toEqual([])
  expect(db.connCalls!.some((c) => c.fn === 'add_exchange_connection')).toBe(false)
  await dialog.getByRole('button', { name: 'Закрыть' }).click()
  await expect(dialog).toBeHidden()
})

test('Карточка подключения: «Ошибка» с подсказкой и ответом биржи при last_error; «Работает» и время до следующей синхронизации', async ({ page, db }) => {
  db.usage = { plan: 'pro_plus', trades_created: 3, trade_limit: null }
  const now = Date.parse('2026-11-12T12:00:00Z')
  await page.clock.setFixedTime(new Date(now))
  db.connections = [
    { id: 'c1', exchange: 'bybit', label: 'Основной', api_key: 'AbCdEf123456', last_sync_at: new Date(now - 10 * 60_000).toISOString(), cursor_at: null, last_error: null, key_expires_at: null, created_at: '2026-11-01T10:00:00Z' },
    { id: 'c2', exchange: 'hyperliquid', label: null, api_key: WALLET.toLowerCase(), last_sync_at: new Date(now - 5 * 3_600_000).toISOString(), cursor_at: null, last_error: 'KEY_NO_PERMISSION | 10005 Permission denied', key_expires_at: null, created_at: '2026-11-02T10:00:00Z' },
  ]
  await fakeSupabase(page, db)
  await page.goto('import')
  // ошибка видна сразу — строкой под блоком; нажатие — панель биржи с подробностями
  await expect(page.locator('[data-issue="hyperliquid"]')).toContainText('У ключа нет прав на чтение сделок')
  await expect(page.locator('[data-issue]')).toHaveCount(1)
  await page.locator('[data-issue="hyperliquid"]').click()
  const bad = page.locator('[data-panel-manage] [data-conn="hyperliquid"]')
  await expect(bad).toHaveAttribute('data-status', 'error')
  await expect(bad.locator('[data-pill]')).toHaveText('Ошибка')
  await expect(bad).toContainText('У ключа нет прав на чтение сделок')
  await expect(bad).toContainText('Ответ биржи: 10005 Permission denied')
  await page.keyboard.press('Escape')
  const ok = await openConn(page, 'bybit')
  await expect(ok.locator('[data-pill]')).toHaveText('Работает')
  await expect(ok).toContainText('Обновлено 10 мин назад · следующее примерно через 2 ч 50 мин')
  await page.keyboard.press('Escape')
  // «скоро по API» — бледные карточки без кнопок, старой строки текста нет
  await expect(page.locator('[data-soon]')).toHaveCount(1)
  await expect(page.locator('[data-soon="Binance"]')).toHaveCount(0)
  await expect(page.locator('[data-soon="Lighter"]')).toContainText('Скоро')
  await expect(page.locator('[data-soon] button')).toHaveCount(0)
  await expect(page.getByText('Скоро по API: Binance')).toHaveCount(0)
})

test('Отключение подключения — только после подтверждения в окне', async ({ page, db }) => {
  db.usage = { plan: 'pro_plus', trades_created: 3, trade_limit: null }
  db.connections = [
    { id: 'c1', exchange: 'bybit', label: 'Основной', api_key: 'AbCdEf123456', last_sync_at: new Date().toISOString(), cursor_at: null, last_error: null, key_expires_at: null, created_at: '2026-11-01T10:00:00Z' },
  ]
  await fakeSupabase(page, db)
  await page.goto('import')
  // отдельных карточек на странице нет — отключение в панели биржи
  await expect(page.locator('[data-conn]')).toHaveCount(0)
  const card = await openConn(page, 'bybit')
  await card.getByRole('button', { name: 'Отключить' }).click()
  const dlg = page.getByRole('dialog', { name: 'Отключить Bybit?' })
  await expect(dlg).toBeVisible()
  await dlg.getByRole('button', { name: 'Отмена' }).click()
  await expect(dlg).toBeHidden()
  expect(db.connCalls?.some((c) => c.fn === 'delete_exchange_connection') ?? false).toBe(false)
  await card.getByRole('button', { name: 'Отключить' }).click()
  await dlg.getByRole('button', { name: 'Отключить' }).click()
  await expect.poll(() => db.connCalls?.some((c) => c.fn === 'delete_exchange_connection')).toBe(true)
  await expect(page.locator('[data-conn="bybit"]')).toHaveCount(0)
})

test('Сетка бирж: карточка OKX → панель «По API» с кодовой фразой; «Файлом» → выбор файла с этой биржей', async ({ page, db }) => {
  db.usage = { plan: 'pro_plus', trades_created: 3, trade_limit: null }
  await fakeSupabase(page, db)
  await page.goto('import')
  const grid = page.locator('[data-exchanges]')
  for (const id of ['bybit', 'binance', 'okx', 'bingx', 'bitget', 'hyperliquid', 'polymarket', 'mexc', 'other']) await expect(grid.locator(`[data-exchange="${id}"]`)).toBeVisible()
  await grid.locator('[data-exchange="okx"]').click()
  const panel = page.getByRole('dialog', { name: 'OKX' })
  await expect(panel.getByRole('tab', { name: 'По API' })).toHaveAttribute('aria-selected', 'true')
  await expect(panel.getByLabel('Кодовая фраза (Passphrase)')).toBeVisible()
  await expect(panel.getByLabel('Биржа')).toHaveCount(0) // биржа уже выбрана карточкой
  await panel.getByRole('tab', { name: 'Файлом' }).click()
  await expect(panel).toContainText('OKX → Активы → История ордеров')
  const chooser = page.waitForEvent('filechooser')
  await panel.getByRole('button', { name: 'Выбрать файл' }).click()
  await (await chooser).setFiles({ name: 'positions.csv', mimeType: 'text/csv', buffer: Buffer.from('Instrument,Direction,Open time,Close time,Open price,Close price,PnL\nBTC-USDT-SWAP,long,2026-11-01 10:00:00,2026-11-01 12:00:00,60000,61000,10\n') })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByLabel('Биржа').first()).toHaveValue('okx')
})

test('Мост: подключение Bybit из карточки — шаги отмечаются, итог и окошко загрузок в углу', async ({ page, db }) => {
  db.usage = { plan: 'pro_plus', trades_created: 3, trade_limit: null }
  await fakeSupabase(page, db)
  await page.goto('import')
  await page.locator('[data-exchange="bybit"]').click()
  const panel = page.getByRole('dialog', { name: 'Bybit' })
  await panel.getByLabel('API Key').fill('AbCdEf123456')
  await panel.getByLabel('API Secret').fill('SuperSecret123456')
  await panel.getByRole('button', { name: 'Подключить', exact: true }).click()
  const bridge = panel.locator('[data-bridge]')
  await expect(bridge).toHaveAttribute('data-stage', 'done', { timeout: 20_000 })
  await expect(bridge.locator('[data-step="done"]')).toHaveCount(3)
  await expect(bridge).toContainText('Только чтение — торговать и выводить нельзя')
  await expect(bridge).toContainText('Загружено новых сделок: 1')
  // окошко фоновых загрузок: синхронизация Bybit готова
  const toast = page.locator('[data-activity]')
  await expect(toast.locator('[data-activity-item="sync"]')).toHaveAttribute('data-status', 'done')
  await expect(toast).toContainText('новых сделок: 1')
  await panel.getByRole('button', { name: 'Закрыть', exact: true }).last().click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('[data-exchange="bybit"]')).toContainText('Подключена')
})

test('«Биржи»: без подключений — «Орбита» с шагами, с подключением — та же «Орбита»: биржа подсвечена, справа её строка; синхронизация — луч по рамке и мерцающий текст', async ({ page, db }) => {
  db.usage = { plan: 'pro_plus', trades_created: 3, trade_limit: null }
  await fakeSupabase(page, db)
  await page.goto('import')
  await expect(page.locator('[data-empty-orbit]')).toContainText('Подключи первую биржу')
  await expect(page.locator('[data-linked-orbit]')).toHaveCount(0)
  // подключаем Bybit — вместо шагов «как подключить» его строка, на орбите Bybit яркий, остальные приглушены
  await page.locator('[data-exchange="bybit"]').click()
  const panel = page.getByRole('dialog', { name: 'Bybit' })
  await panel.getByLabel('API Key').fill('AbCdEf123456')
  await panel.getByLabel('API Secret').fill('SuperSecret123456')
  await panel.getByRole('button', { name: 'Подключить', exact: true }).click()
  await expect(panel.locator('[data-bridge]')).toHaveAttribute('data-stage', 'done', { timeout: 20_000 })
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-empty-orbit]')).toHaveCount(0)
  const block = page.locator('[data-linked-orbit]')
  await expect(block).toContainText('Подключено: Bybit')
  await expect(block.locator('[data-linked]')).toHaveCount(1)
  await expect(block.locator('[data-orbit-sat="bybit"]')).toHaveAttribute('data-lit', 'on')
  await expect(block.locator('[data-orbit-sat="binance"]')).toHaveAttribute('data-lit', 'off')
  // старого блока с частицами больше нет
  await expect(page.locator('[data-arrivals-curve], canvas')).toHaveCount(0)
  // «Подключить ещё» — общая панель выбора биржи
  await block.getByRole('button', { name: 'Подключить ещё' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  // «Обновить»: пока идёт синхронизация — луч по рамке карточки и «Ищем новые сделки…»
  await page.route('**/functions/v1/exchange-proxy', async (route) => {
    await new Promise((r) => setTimeout(r, 800))
    await route.fallback()
  })
  const tile = await openConn(page, 'bybit')
  await tile.getByRole('button', { name: 'Обновить' }).click()
  await expect(tile).toHaveClass(/beam-run/)
  await expect(tile).toContainText('Ищем новые сделки…')
  await expect(tile).not.toHaveClass(/beam-run/, { timeout: 20_000 })
})

test('«Подключено»: число сделок — за всё время, по API и файлом; сделки неподключённой биржи не считаются; на телефоне без прокрутки вбок', async ({ page, db }) => {
  db.usage = { plan: 'pro_plus', trades_created: 3, trade_limit: null }
  db.connections = [{ id: 'c1', exchange: 'bybit', label: null, api_key: 'AbCdEf123456', last_sync_at: new Date().toISOString(), cursor_at: new Date().toISOString(), last_error: null, created_at: '' }]
  const at = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()
  db.trades = [
    makeTrade(1, { pnl: 100, source: 'api', entry_at: at(30), exit_at: at(29), external_id: 'o:1' }),
    makeTrade(2, { pnl: -40, source: 'api', entry_at: at(20), exit_at: at(19), external_id: 'o:2' }),
    makeTrade(3, { pnl: 60.5, source: 'api', entry_at: at(10), exit_at: at(9), external_id: 'o:3' }),
    // из файла и давно — тоже считается (за всё время, владелец 17.11.2026)
    makeTrade(4, { pnl: 999, source: 'import', entry_at: at(2000), exit_at: at(1999), external_id: 'f:4' }),
    // биржа не подключена — не считается
    makeTrade(5, { exchange: 'okx', pnl: 5000, source: 'import', entry_at: at(5), exit_at: at(4), external_id: 'f:5' }),
  ]
  await fakeSupabase(page, db)
  await page.route('**/functions/v1/exchange-proxy', (route) => route.fulfill({ status: 500, body: '' }))
  await page.goto('import')
  const block = page.locator('[data-linked-orbit]')
  await expect(block.locator('[data-linked="bybit"]')).toContainText('работает · сделок: 4')
  await expect(block.locator('[data-linked="okx"]')).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(block.locator('[data-linked="bybit"]')).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('«Подключено»: сделок с биржи ещё нет — просто «работает», без числа', async ({ page, db }) => {
  db.usage = { plan: 'pro_plus', trades_created: 3, trade_limit: null }
  db.connections = [{ id: 'c1', exchange: 'bybit', label: null, api_key: 'AbCdEf123456', last_sync_at: new Date().toISOString(), cursor_at: new Date().toISOString(), last_error: null, created_at: '' }]
  await fakeSupabase(page, db)
  await page.route('**/functions/v1/exchange-proxy', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ retCode: 0, result: { list: [] } }) }))
  await page.goto('import')
  const row = page.locator('[data-linked-orbit] [data-linked="bybit"]')
  await expect(row).toHaveAttribute('data-state', 'ok')
  await expect(row).toContainText('работает')
  await expect(row).not.toContainText('сделок')
})

test('«Подключено»: пять бирж — все строками с числом сделок, все подсвечены на орбите; больше трёх в заголовке — «и ещё N»', async ({ page, db }) => {
  db.usage = { plan: 'pro_plus', trades_created: 3, trade_limit: null }
  const all = ['bybit', 'binance', 'okx', 'bitget', 'bingx']
  db.connections = all.map((e, i) => ({ id: `c${i}`, exchange: e, label: null, api_key: `AbCdEf12345${i}`, last_sync_at: new Date().toISOString(), cursor_at: new Date().toISOString(), last_error: null, created_at: `2026-11-0${i + 1}T00:00:00Z` }))
  const at = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()
  db.trades = [
    makeTrade(1, { exchange: 'bybit', pnl: 10, source: 'api', entry_at: at(30), exit_at: at(29), external_id: 'o:1' }),
    makeTrade(2, { exchange: 'okx', pnl: 20, source: 'api', entry_at: at(20), exit_at: at(19), external_id: 'o:2' }),
    makeTrade(3, { exchange: 'okx', pnl: 30, source: 'api', entry_at: at(10), exit_at: at(9), external_id: 'o:3' }),
  ]
  await fakeSupabase(page, db)
  await page.route('**/functions/v1/exchange-proxy', (route) => route.fulfill({ status: 500, body: '' }))
  await page.goto('import')
  const block = page.locator('[data-linked-orbit]')
  await expect(block.locator('[data-linked]')).toHaveCount(5)
  await expect(block.locator('[data-linked="okx"]')).toContainText('сделок: 2')
  await expect(block.locator('[data-linked="bybit"]')).toContainText('сделок: 1')
  await expect(block.locator('[data-linked="binance"]')).toContainText('работает')
  await expect(block).toContainText('Подключено: Bybit, Binance, OKX и ещё 2')
  for (const ex of all) await expect(block.locator(`[data-orbit-sat="${ex}"]`)).toHaveAttribute('data-lit', 'on')
})

test('«Подключено»: статусы — ошибка ключа, пауза сверх тарифа; кошелёк — строкой с адресом и на орбите', async ({ page, db }) => {
  // Pro: одно подключение работает, второе (по дате) — «на паузе»; у первого ошибка
  db.usage = { plan: 'pro', trades_created: 3, trade_limit: null }
  db.connections = [
    { id: 'c1', exchange: 'bybit', label: null, api_key: 'AbCdEf123456', last_sync_at: new Date().toISOString(), cursor_at: null, last_error: 'retCode 10003: API key is invalid', created_at: '2026-11-01T00:00:00Z' },
    { id: 'c2', exchange: 'okx', label: null, api_key: 'AbCdEf654321', last_sync_at: null, cursor_at: null, last_error: null, created_at: '2026-11-02T00:00:00Z' },
    { id: 'c3', exchange: 'evm', label: null, api_key: '0x' + 'b'.repeat(40), last_sync_at: null, cursor_at: null, last_error: null, created_at: '2026-11-03T00:00:00Z' },
  ]
  await fakeSupabase(page, db)
  await page.route('**/functions/v1/exchange-proxy', (route) => route.fulfill({ status: 500, body: '' }))
  await page.route('https://*.publicnode.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.goto('import')
  const block = page.locator('[data-linked-orbit]')
  await expect(block.locator('[data-linked="bybit"]')).toHaveAttribute('data-state', /error|syncing/)
  await expect(block.locator('[data-linked="okx"]')).toHaveAttribute('data-state', 'paused')
  await expect(block.locator('[data-linked="okx"]')).toContainText('На паузе')
  await expect(block.locator('[data-orbit-sat="evm"]')).toHaveAttribute('data-lit', 'on')
})

test('«Подключено»: подключены только кошельки — строкой с адресом, нажатие — панель с «Отключить»; добавили биржу — у неё число сделок', async ({ page, db }) => {
  db.usage = { plan: 'pro_plus', trades_created: 3, trade_limit: null }
  db.connections = [{ id: 'w1', exchange: 'solana', label: null, api_key: '7'.repeat(43), last_sync_at: null, cursor_at: null, last_error: null, created_at: '' }]
  await fakeSupabase(page, db)
  await page.route('https://solana-rpc.publicnode.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.goto('import')
  const block = page.locator('[data-linked-orbit]')
  await expect(block.locator('[data-linked="solana"]')).toContainText('кошелёк · 777777…7777')
  await block.locator('[data-linked="solana"] button').click()
  await expect(page.locator('[data-panel-manage] [data-conn="solana"]').getByRole('button', { name: 'Отключить' })).toBeVisible()
  await page.keyboard.press('Escape')

  db.connections.push({ id: 'c1', exchange: 'bybit', label: null, api_key: 'AbCdEf123456', last_sync_at: new Date().toISOString(), cursor_at: new Date().toISOString(), last_error: null, created_at: '' })
  db.trades = [makeTrade(1, { pnl: 42.5, source: 'api', entry_at: new Date(Date.now() - 7_200_000).toISOString(), exit_at: new Date(Date.now() - 3_600_000).toISOString(), external_id: 'o:1' })]
  await page.route('**/functions/v1/exchange-proxy', (route) => route.fulfill({ status: 500, body: '' }))
  await page.reload()
  await expect(block.locator('[data-linked="bybit"]')).toContainText('сделок: 1')
  await expect(block.locator('[data-linked]')).toHaveCount(2)
})

test('«Подключено»: 400 сделок — число сразу, без ожидания анимации', async ({ page, db }) => {
  db.usage = { plan: 'pro_plus', trades_created: 3, trade_limit: null }
  db.connections = [{ id: 'c1', exchange: 'bybit', label: null, api_key: 'AbCdEf123456', last_sync_at: new Date().toISOString(), cursor_at: new Date().toISOString(), last_error: null, created_at: '' }]
  db.trades = Array.from({ length: 400 }, (_, i) => {
    const exit = new Date(Date.now() - (400 - i) * 20 * 60_000).toISOString()
    return makeTrade(i + 1, { pnl: 1, source: 'api', entry_at: new Date(Date.parse(exit) - 60_000).toISOString(), exit_at: exit, external_id: `o:${i}` })
  })
  await fakeSupabase(page, db)
  await page.route('**/functions/v1/exchange-proxy', (route) => route.fulfill({ status: 500, body: '' }))
  await page.goto('import')
  await expect(page.locator('[data-linked-orbit] [data-linked="bybit"]')).toContainText('сделок: 400', { timeout: 5_000 })
})

/**
 * Владелец 17.11.2026: «подключил Bybit — у тебя Bybit, подключил Binance — Binance… подключил одну — именно она».
 * В блоке «Подключено» — ровно подключённые биржи, ни одной лишней («можно подключить» — только в сетке ниже).
 * Lighter подключить пока нельзя («Скоро»).
 */
const TRADE_EXCHANGES = ['bybit', 'binance', 'okx', 'bingx', 'bitget', 'hyperliquid', 'polymarket'] as const
const keyFor = (ex: string, i = 0) => (ex === 'hyperliquid' || ex === 'polymarket' ? '0x' + String(i + 1).repeat(40) : `AbCdEf12345${i}`)
const connRow = (ex: string, i = 0) => ({ id: `c-${ex}`, exchange: ex, label: null, api_key: keyFor(ex, i), last_sync_at: new Date().toISOString(), cursor_at: new Date().toISOString(), last_error: null, created_at: `2026-11-0${i + 1}T00:00:00Z` })

for (const ex of TRADE_EXCHANGES)
  test(`«Подключено»: подключена только ${ex} — в блоке именно она и больше ничего`, async ({ page, db }) => {
    db.usage = { plan: 'pro_plus', trades_created: 3, trade_limit: null }
    db.connections = [connRow(ex)]
    // сделки и у других бирж — в блок они не попадают
    db.trades = [
      makeTrade(1, { exchange: ex, pnl: 10, source: 'api', entry_at: '2026-10-01T10:00:00Z', exit_at: '2026-10-01T11:00:00Z', external_id: 'a:1' }),
      makeTrade(2, { exchange: ex === 'binance' ? 'bybit' : 'binance', pnl: 99, source: 'import', entry_at: '2026-10-02T10:00:00Z', exit_at: '2026-10-02T11:00:00Z', external_id: 'b:2' }),
    ]
    await fakeSupabase(page, db)
    await page.route('**/functions/v1/exchange-proxy', (route) => route.fulfill({ status: 500, body: '' }))
    await page.route('https://api.hyperliquid.xyz/**', (route) => route.fulfill({ status: 500, body: '' }))
    await page.goto('import')
    const block = page.locator('[data-linked-orbit]')
    await expect(block.locator('[data-linked]')).toHaveCount(1)
    await expect(block.locator(`[data-linked="${ex}"]`)).toContainText('сделок: 1')
    await expect(block.locator(`[data-orbit-sat="${ex}"]`)).toHaveAttribute('data-lit', 'on')
    await expect(block.locator('[data-orbit-sat][data-lit="on"]')).toHaveCount(1)
  })

test('«Подключено»: две биржи и кошелёк — ровно три строки; Lighter нигде не подключён', async ({ page, db }) => {
  db.usage = { plan: 'pro_plus', trades_created: 3, trade_limit: null }
  db.connections = [connRow('okx', 0), connRow('hyperliquid', 1), { ...connRow('evm', 2), api_key: '0x' + 'c'.repeat(40) }]
  await fakeSupabase(page, db)
  await page.route('**/functions/v1/exchange-proxy', (route) => route.fulfill({ status: 500, body: '' }))
  await page.route('https://api.hyperliquid.xyz/**', (route) => route.fulfill({ status: 500, body: '' }))
  await page.route('https://*.publicnode.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.goto('import')
  const rows = page.locator('[data-linked-orbit] [data-linked]')
  await expect(rows).toHaveCount(3)
  expect((await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-linked')))).sort()).toEqual(['evm', 'hyperliquid', 'okx'])
  await expect(page.locator('[data-linked-orbit] [data-linked="lighter"]')).toHaveCount(0)
})
