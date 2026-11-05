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
