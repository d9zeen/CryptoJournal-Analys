/** Кошельки для «Портфеля» (0021): Solana по адресу — монеты из нашего списка, без сделок; адрес не меняет регистр */
import { test, expect, fakeSupabase } from './fixtures'

const SOL_ADDR = 'DRpbCBMxVnDK7maPM5tGv6MvB3v1sRMC86PZ8okm21hy'
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const coin = (id: string, symbol: string, rank: number, price: number, platforms: Record<string, string> = {}) => ({
  id, symbol, name: symbol, rank, price, change_24h: 1, change_7d: 2, spark: Array.from({ length: 42 }, () => price), icon: null, color: null, platforms,
})

test('кошелёк Solana: подключение → монеты в «Портфеле»', async ({ page, db }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  db.usage = { plan: 'pro_plus', trades_created: 0, trade_limit: null }
  db.coins = [coin('solana', 'SOL', 5, 200), coin('usd-coin', 'USDC', 7, 1, { solana: USDC_MINT }), coin('bitcoin', 'BTC', 1, 100000)]
  await fakeSupabase(page, db)
  const asked: { method: string; params: unknown[] }[] = []
  await page.route('https://solana-rpc.publicnode.com/**', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '[]') as { id: number; method: string; params: unknown[] }[]
    asked.push(...body)
    const acc = (mint: string, amount: string, decimals: number) => ({ account: { data: { parsed: { info: { mint, tokenAmount: { amount, decimals } } } } } })
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(body.map((r) => ({
        jsonrpc: '2.0',
        id: r.id,
        result: r.method === 'getBalance'
          ? { value: 3_000_000_000 }
          : { value: (r.params[1] as { programId: string }).programId.startsWith('Tokenkeg') ? [acc(USDC_MINT, '150000000', 6), acc('SpamMintSpamMintSpamMintSpamMint11', '1000', 0)] : [] },
      }))),
    })
  })

  await page.goto('import')
  await page.getByRole('button', { name: '+ Подключить' }).click()
  await page.getByLabel('Биржа').first().selectOption('solana')
  await page.getByLabel('Адрес кошелька').fill(SOL_ADDR)
  await page.getByRole('button', { name: 'Подключить', exact: true }).click()

  await expect(page.getByText('Монет в кошельке: 2')).toBeVisible()
  await expect(page.getByText('Solana подключён')).toBeVisible()
  // адрес ушёл в базу и на узел сети как есть (регистр важен), сделок кошелёк не пишет
  expect(db.connCalls?.find((c) => c.fn === 'add_exchange_connection')?.body).toMatchObject({ p_exchange: 'solana', p_api_key: SOL_ADDR })
  expect(asked[0]).toMatchObject({ method: 'getBalance', params: [SOL_ADDR] })
  expect(db.inserted.filter((x) => x.table === 'trades')).toHaveLength(0)
  // спам-токен не попал: только SOL и USDC из нашего списка
  await expect.poll(() => db.portfolioCalls?.find((c) => c.fn === 'replace_holdings')?.body.p_items).toEqual([
    { account: 'wallet', symbol: 'SOL', amount: 3 },
    { account: 'wallet', symbol: 'USDC', amount: 150 },
  ])

  await page.locator('[data-bridge]').getByRole('button', { name: 'Закрыть' }).click()
  await page.goto('portfolio')
  const table = page.locator('[data-portfolio-table]')
  await expect(table.locator('[data-coin="SOL"]')).toContainText('600,00 $')
  await expect(table.locator('[data-coin="SOL"]')).toContainText('Solana')
  await expect(table.locator('[data-coin="USDC"]')).toContainText('150,00 $')
})
