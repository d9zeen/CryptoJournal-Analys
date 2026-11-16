/** Подключения бирж: Hyperliquid по адресу кошелька, Bybit и OKX по ключу «только чтение» (у OKX — с кодовой фразой) */
import { test, expect, fakeSupabase } from './fixtures'

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
  await expect(page.locator('[data-conn="hyperliquid"]')).toHaveAttribute('data-status', 'ok')
  await expect(page.locator('[data-conn="hyperliquid"]')).toContainText(/Обновлено (только что|.+ назад)/)
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
  await expect(page.getByText(/следующее примерно через 2 ч (59|58) мин/)).toBeVisible()
  await expect(page.getByText(/Ключ Bybit перестанет работать/)).toBeVisible()
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
  const row = page.locator('[data-conn="polymarket"]')
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
  const bad = page.locator('[data-conn="hyperliquid"]')
  await expect(bad).toHaveAttribute('data-status', 'error')
  await expect(bad.locator('[data-pill]')).toHaveText('Ошибка')
  await expect(bad).toContainText('У ключа нет прав на чтение сделок')
  await expect(bad).toContainText('Ответ биржи: 10005 Permission denied')
  const ok = page.locator('[data-conn="bybit"]')
  await expect(ok.locator('[data-pill]')).toHaveText('Работает')
  await expect(ok).toContainText('Обновлено 10 мин назад · следующее примерно через 2 ч 50 мин')
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
  const card = page.locator('[data-conn="bybit"]')
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

test('Анимации «Бирж»: без подключений — «Орбита», с подключением — «Поток в дневник», синхронизация — луч по рамке и мерцающий текст', async ({ page, db }) => {
  db.usage = { plan: 'pro_plus', trades_created: 3, trade_limit: null }
  await fakeSupabase(page, db)
  await page.goto('import')
  await expect(page.locator('[data-empty-orbit]')).toContainText('Подключи первую биржу')
  await expect(page.locator('[data-beam-hub]')).toHaveCount(0)
  // подключаем Bybit — появляется «Поток в дневник», Bybit горит
  await page.locator('[data-exchange="bybit"]').click()
  const panel = page.getByRole('dialog', { name: 'Bybit' })
  await panel.getByLabel('API Key').fill('AbCdEf123456')
  await panel.getByLabel('API Secret').fill('SuperSecret123456')
  await panel.getByRole('button', { name: 'Подключить', exact: true }).click()
  await expect(panel.locator('[data-bridge]')).toHaveAttribute('data-stage', 'done', { timeout: 20_000 })
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-empty-orbit]')).toHaveCount(0)
  await expect(page.locator('[data-beam-hub] [data-hub-node="bybit"]')).toHaveAttribute('data-on', 'true')
  await expect(page.locator('[data-beam-hub] [data-hub-node="okx"]')).not.toHaveAttribute('data-on', 'true')
  // «Обновить»: пока идёт синхронизация — луч по рамке карточки и «Ищем новые сделки…»
  await page.route('**/functions/v1/exchange-proxy', async (route) => {
    await new Promise((r) => setTimeout(r, 800))
    await route.fallback()
  })
  const tile = page.locator('[data-conn="bybit"]')
  await tile.getByRole('button', { name: 'Обновить' }).click()
  await expect(tile).toHaveClass(/beam-run/)
  await expect(tile).toContainText('Ищем новые сделки…')
  await expect(tile).not.toHaveClass(/beam-run/, { timeout: 20_000 })
})
