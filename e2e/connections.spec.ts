/** Подключения бирж: Hyperliquid по адресу кошелька, Bybit по ключу «только чтение» */
import { test, expect, fakeSupabase } from './fixtures'

const WALLET = '0xAbCdEf0123456789abcdef0123456789ABCDEF01'

test('Hyperliquid: подключение кошелька и первая синхронизация', async ({ page, db }) => {
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
  await expect(page.getByText(/Обновлено:/)).toBeVisible()
})

test('Bybit: ключ с правом торговли не принимаем', async ({ page, db }) => {
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

test('Pro: синхронизация на сервере каждые 3 часа и предупреждение о сроке ключа Bybit', async ({ page, db }) => {
  db.usage = { plan: 'pro', trades_created: 3, trade_limit: null }
  const soon = new Date(Date.now() + 5 * 86_400_000).toISOString()
  db.connections = [
    { id: 'c1', exchange: 'bybit', label: 'основной', api_key: 'AbCdEf123456', last_sync_at: new Date().toISOString(), cursor_at: new Date().toISOString(), last_error: null, key_expires_at: soon, created_at: '' },
  ]
  await fakeSupabase(page, db)
  await page.goto('import')
  await expect(page.getByText(/Pro: сделки подтягиваются на сервере каждые 3 часа/)).toBeVisible()
  await expect(page.getByText(/дальше — сам каждые 3 часа/)).toBeVisible()
  await expect(page.getByText(/Ключ Bybit перестанет работать/)).toBeVisible()
})

test('Free: подсказка про Pro', async ({ page, db }) => {
  await fakeSupabase(page, db)
  await page.goto('import')
  await expect(page.getByText(/На Pro — сами на сервере каждые 3 часа/)).toBeVisible()
})

test('Polymarket: подключение по адресу — закрытые позиции становятся сделками с названием рынка', async ({ page, db }) => {
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
