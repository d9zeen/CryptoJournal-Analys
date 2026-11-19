// Вкладка «Портфель» (0019): балансы с биржи сами, иконки монет, сводка, график, доли, монета вручную, цена входа
import { test, expect, fakeSupabase, type FakeDb } from './fixtures'

const coin = (id: string, symbol: string, name: string, rank: number, price: number, change_24h: number, icon: string | null = `${id}.png`) => ({
  id, symbol, name, rank, price, change_24h, change_7d: 3, spark: Array.from({ length: 42 }, (_, i) => price * (1 + Math.sin(i / 6) / 50)), icon,
})
const COINS = [
  coin('bitcoin', 'BTC', 'Bitcoin', 1, 100000, 2),
  coin('ethereum', 'ETH', 'Ethereum', 2, 3000, -4),
  coin('tether', 'USDT', 'Tether', 3, 1, 0),
  coin('shiba-inu', 'SHIB', 'Shiba Inu', 20, 0.00001, 1, null),
]

function proPlus(db: FakeDb) {
  db.usage = { plan: 'pro_plus', trades_created: 3, trade_limit: null }
  db.coins = COINS
  db.connections = [
    { id: 'c1', exchange: 'bybit', label: 'Основной', api_key: 'AbCdEf123456', last_sync_at: new Date().toISOString(), cursor_at: null, last_error: null, key_expires_at: null, created_at: '2026-11-01T10:00:00Z' },
  ]
  const now = Date.now()
  db.snapshots = [
    { at: new Date(now - 6 * 86_400_000).toISOString(), total_usd: 28000, btc_price: 90000 },
    { at: new Date(now - 3 * 86_400_000).toISOString(), total_usd: 30500, btc_price: 95000 },
    { at: new Date(now - 2 * 3_600_000).toISOString(), total_usd: 31400, btc_price: 99000 },
  ]
}

test('портфель: балансы Bybit приходят сами, иконки, сводка, график, доли', async ({ page, db, isMobile }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  proPlus(db)
  await fakeSupabase(page, db)
  await page.goto('portfolio')

  // открыли — балансы подтянулись с биржи по ключу «только чтение» и записались одной функцией
  await expect.poll(() => db.portfolioCalls?.find((c) => c.fn === 'replace_holdings')?.body).toMatchObject({
    p_connection: 'c1',
    p_items: expect.arrayContaining([
      { account: 'spot', symbol: 'BTC', amount: 0.25 },
      { account: 'fund', symbol: 'USDT', amount: 1200.5 },
      { account: 'fund', symbol: 'ETH', amount: 2 },
    ]),
  })
  // только спот: 5 000 USDT единого счёта Bybit — маржа фьючерсов, их нет среди записанных балансов
  expect((db.portfolioCalls?.find((c) => c.fn === 'replace_holdings')?.body.p_items as { account: string; symbol: string }[]).filter((x) => x.symbol === 'USDT')).toEqual([
    { account: 'fund', symbol: 'USDT', amount: 1200.5 },
  ])
  // снимок — после балансов и истории покупок
  await expect.poll(() => db.portfolioCalls?.some((c) => c.fn === 'portfolio_snapshot')).toBe(true)
  // этап 2: история спотовых покупок Bybit записана — из неё средняя цена входа
  await expect.poll(() => db.portfolioCalls?.find((c) => c.fn === 'add_spot_fills' && (c.body.p_items as unknown[]).length)?.body).toMatchObject({
    p_connection: 'c1',
    p_items: [{ external_id: 'bb:spot-1', asset: 'BTC', quote: 'USDT', side: 'buy', qty: 0.25, price: 80000 }],
  })

  const table = page.locator('[data-portfolio-table]')
  await expect(table.locator('[data-coin="BTC"]')).toContainText('25 000,00 $')
  await expect(table.locator('[data-coin="BTC"]')).toContainText('Bybit')
  // у Bybit «спот» — это единый счёт (спот и фьючерсы, с открытыми позициями) — так и подписано
  await expect(table.locator('[data-coin="BTC"] [title*="единый счёт"]')).toHaveCount(1)
  // иконка — с нашего Storage, а не с CoinGecko
  const icon = table.locator('[data-coin="BTC"] img')
  await expect(icon).toHaveAttribute('src', /\/storage\/v1\/object\/public\/coin-icons\/bitcoin\.png$/)
  await expect.poll(() => icon.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1)
  // мелочь (SHIB на 0,0001 $) скрыта, переключатель её показывает
  await expect(table.locator('[data-coin="SHIB"]')).toHaveCount(0)
  await page.getByRole('switch', { name: 'Скрыть мелочь до 1 $' }).uncheck({ force: true })
  await expect(table.locator('[data-coin="SHIB"]')).toBeVisible()

  // сводка (только спот): 25 000 + 6 000 + 1 200,5 USDT на фандинге = 32 200,50 $ — одной крупной цифрой, три показателя рядом строкой
  const hero = page.locator('[data-hero]')
  await expect(hero).toHaveText('32 200,50 $')
  await expect(page.locator('[data-spot-only]')).toContainText('только спот')
  const kpis = page.locator('[data-portfolio-kpis]')
  await expect(kpis.locator('dt')).toHaveText(['За 24 часа', 'Прибыль', 'Зафиксировано'])
  // прибыль: у BTC цена входа — из покупки на Bybit; USDT — стейблкоин, в прибыль не идёт; у ETH и SHIB — не указана
  await expect(kpis).toContainText('по цене входа у 1 из 3')
  await expect(kpis.locator('[data-kpi-realized]')).toContainText('Зафиксировано')

  // график (3 снимка + «сейчас») и полоса долей: от большей к меньшей, проценты на блоках, суммы в легенде
  await expect(page.locator('[data-portfolio-chart] .recharts-area')).toBeVisible()
  const alloc = page.locator('[data-portfolio-alloc]')
  await expect(alloc.getByRole('img', { name: /^Доли монет: BTC 77,6 %, ETH 18,6 %, USDT 3,7 %$/ })).toBeVisible()
  await expect(alloc.locator('[data-alloc-bar] [data-seg]')).toHaveCount(3)
  await expect(alloc.locator('[data-alloc-bar] [data-seg="BTC"]')).toHaveText('77,6 %')
  // USDT — 3,7 %: на узком блоке процент не печатается, он в легенде рядом с суммой
  await expect(alloc.locator('[data-alloc-bar] [data-seg="USDT"]')).toHaveText('')
  await expect(alloc.locator('li[data-seg="USDT"]')).toContainText('1 200,50 $3,7 %')
  await expect(alloc).toContainText('Хуже всех за 24 ч')
  // наведение на строку легенды — блок этой монеты выделен, остальные приглушены
  await alloc.locator('li[data-seg="ETH"]').hover()
  await expect(alloc.locator('[data-alloc-bar]')).toHaveAttribute('data-hover', 'ETH')
  await expect.poll(() => alloc.locator('[data-alloc-bar] [data-seg="BTC"]').evaluate((e) => getComputedStyle(e).opacity)).toBe('0.35')
  await expect(alloc.locator('[data-alloc-bar] [data-seg="ETH"]')).toHaveCSS('opacity', '1')
  await page.mouse.move(0, 0)
  // мини-график стейблкоина — ровная линия, у остальных — точка цветом итога недели
  await expect(table.locator('[data-coin="USDT"] [data-spark]')).toHaveAttribute('data-spark', 'flat')
  // ведём мышью по графику (на сенсорном экране — обычная подсказка у точки) — крупная цифра показывает стоимость в точке, строка над графиком — дату и изменение; убрали мышь — снова «сейчас»
  if (!isMobile) {
    const box = (await page.locator('[data-portfolio-chart]').boundingBox())!
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2)
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2, { steps: 5 })
    await expect(page.locator('[data-hero-scrub]')).toBeVisible()
    await expect(page.locator('[data-scrub-line]')).toContainText('с начала периода')
    await expect(page.locator('[data-portfolio-value] h2')).toHaveText('Стоимость портфеля')
    await page.mouse.move(0, 0)
    await expect(page.locator('[data-hero-scrub]')).toHaveCount(0)
    await expect(hero).toHaveText('32 200,50 $')
  }
  // подписи оси дат не повторяются (ось — по номеру точки, раньше выходило «12.11, 12.11»)
  const tickText = page.locator('[data-portfolio-chart] .recharts-xAxis-tick-labels text')
  await expect.poll(() => tickText.count()).toBeGreaterThan(1)
  const ticks = await tickText.allTextContents()
  expect(new Set(ticks).size).toBe(ticks.length)
  // период графика — группа вариантов: Tab заходит на выбранный, стрелки переключают
  const ranges = page.getByRole('radiogroup', { name: 'Период графика' })
  const picked = ranges.locator('[aria-checked="true"]')
  const start = await picked.textContent()
  await picked.focus()
  await page.keyboard.press('ArrowRight')
  await expect(picked).not.toHaveText(start ?? '')
  await expect(picked).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(picked).toHaveText(start ?? '')
  await expect(ranges.locator('[tabindex="0"]')).toHaveCount(1)

  // средняя цена BTC — из истории покупок: 0,25 по 80 000 → прибыль +5 000 $
  const btcAvg = table.locator('[data-coin="BTC"] [data-avg-source]')
  await expect(btcAvg).toHaveAttribute('data-avg-source', 'trades')
  await expect(btcAvg).toContainText('по сделкам')
  await expect(table.locator('[data-coin="BTC"]')).toContainText('+5 000,00 $')
  // руками важнее истории: 70 000 → +7 500 $
  await btcAvg.click()
  await page.getByRole('textbox', { name: 'Средняя цена входа BTC, $' }).fill('70000')
  await table.locator('[data-coin="BTC"]').getByRole('button', { name: 'Сохранить' }).click()
  await expect.poll(() => db.costWrites?.[0]).toMatchObject({ method: 'POST', body: { symbol: 'BTC', avg_price: 70000 } })
  await expect(btcAvg).toHaveAttribute('data-avg-source', 'manual')
  await expect(table.locator('[data-coin="BTC"]')).toContainText('+7 500,00 $')
  // ETH без истории — «указать»
  await expect(table.locator('[data-coin="ETH"]').getByRole('button', { name: 'указать' })).toBeVisible()

  // страница не шире экрана
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440)
})

test('портфель на Basic: пусто → монета вручную', async ({ page, db }) => {
  db.coins = COINS
  await fakeSupabase(page, db)
  await page.goto('portfolio')
  const empty = page.locator('[data-portfolio-empty]')
  await expect(empty).toContainText('Портфель пока пустой')
  await expect(empty.locator('[data-upgrade]')).toBeVisible()

  await empty.getByRole('button', { name: 'Добавить монету' }).click()
  const dialog = page.locator('[data-add-coin]')
  await dialog.getByPlaceholder('BTC, Ethereum…').fill('eth')
  await dialog.getByRole('button', { name: /ETH/ }).click()
  await dialog.getByLabel('Количество').fill('1,5')
  await dialog.getByLabel('Где лежит (необязательно)').fill('Ledger')
  await dialog.getByRole('button', { name: 'Добавить', exact: true }).click()
  await expect.poll(() => db.holdings?.[0]).toMatchObject({ account: 'manual', symbol: 'ETH', amount: 1.5, note: 'Ledger' })
  // монета появилась (на телефоне — карточкой, на компьютере — строкой)
  await expect(page.locator('[data-coin="ETH"]')).toContainText('4 500,00 $')
  await expect(page.locator('[data-coin="ETH"]')).toContainText('Вручную')
  // снимков ещё нет — график сразу есть: оценка по нынешнему составу за неделю (сплошная линия, подпись над графиком)
  await expect(page.locator('[data-portfolio-chart] .recharts-area').first()).toBeVisible()
  await expect(page.locator('[data-chart-estimate]')).toContainText('оценка')
})

test('портфель на телефоне: карточки монет, «Портфель» в нижнем меню', async ({ page, db, isMobile }) => {
  test.skip(!isMobile, 'только телефон')
  proPlus(db)
  await fakeSupabase(page, db)
  await page.goto('portfolio')
  await expect(page.locator('[data-portfolio-cards] [data-coin="BTC"]')).toContainText('25 000,00 $')
  await expect(page.locator('[data-portfolio-cards] [data-coin="BTC"] img')).toBeVisible()
  const nav = page.locator('nav.fixed')
  await expect(nav.getByRole('link')).toHaveCount(6)
  await expect(nav.getByRole('link', { name: 'Портфель' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
})

const many = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `c${i}`, symbol: `C${i}`, name: `Coin ${i}`, rank: i + 1, price: 100 - i * 10, change_24h: i % 2 ? -1 : 1, change_7d: 0, spark: null, icon: null }))
const manual = (symbols: string[], amount = 1) =>
  symbols.map((symbol, i) => ({ id: `m${i}`, connection_id: null, account: 'manual', symbol, amount, value_usd: null, note: null, updated_at: new Date().toISOString() }))

test('доли: 7 монет — 4 крупные и «Другое», одна монета — 100 %, без цены — объяснение', async ({ page, db }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  db.usage = { plan: 'pro', trades_created: 0, trade_limit: null }
  db.coins = many(7)
  db.holdings = manual(['C0', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6'])
  await fakeSupabase(page, db)
  await page.goto('portfolio')
  const alloc = page.locator('[data-portfolio-alloc]')
  // 100 + 90 + 80 + 70 = четыре крупные, остальные три (60 + 50 + 40 = 150) — «Другое · 3 монеты»
  await expect(alloc.locator('[data-alloc-bar] [data-seg]')).toHaveCount(5)
  await expect(alloc.locator('li[data-seg]').last()).toContainText('Другое3 монеты')
  await expect(alloc.locator('li[data-seg="other"]')).toContainText('150,00 $')
  // цвет — по месту доли (шаги одного фиолетового), «Другое» — серый токен
  await expect(alloc.locator('[data-alloc-bar] [data-seg="C0"]')).toHaveAttribute('style', /--color-alloc-1/)
  await expect(alloc.locator('[data-alloc-bar] [data-seg="other"]')).toHaveAttribute('style', /--color-alloc-other/)

  db.holdings = manual(['C0'])
  await page.reload()
  await expect(alloc.locator('[data-alloc-bar] [data-seg]')).toHaveCount(1)
  await expect(alloc.locator('[data-alloc-bar] [data-seg="C0"]')).toHaveText('100 %')

  // монета без цены: стоимость 0 — долю посчитать не из чего
  db.coins = [{ ...many(1)[0], price: null }]
  await page.reload()
  await expect(alloc).toContainText('Нет монет с ценой')
  await expect(alloc.locator('[data-alloc-bar]')).toHaveCount(0)
  await expect(page.locator('[data-hero-sub]')).toContainText('без цены: 1')
})

test('портфель по ссылке без сумм: в легенде долей нет денег', async ({ page, db }) => {
  db.coins = many(2)
  db.share = { token: 'ab'.repeat(16), show_amounts: false }
  db.shared = {
    show_amounts: false,
    total: null,
    coins: [
      { symbol: 'C0', name: 'Coin 0', share: 0.7, change_24h: 1 },
      { symbol: 'C1', name: 'Coin 1', share: 0.3, change_24h: -1 },
    ],
    history: [],
  }
  await fakeSupabase(page, db, { signedIn: false })
  await page.goto(`p/${'ab'.repeat(16)}`)
  const alloc = page.locator('[data-portfolio-alloc]')
  await expect(alloc.locator('[data-alloc-bar] [data-seg="C0"]')).toHaveText('70 %')
  await expect(alloc.locator('li[data-seg="C0"]')).not.toContainText('$')
})

test('фильтр источника: цифры — по источнику, над графиком сказано, что график — весь портфель', async ({ page, db }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  proPlus(db)
  db.holdings = manual(['ETH'])
  await fakeSupabase(page, db)
  await page.goto('portfolio')
  const sources = page.getByRole('radiogroup', { name: 'Откуда монеты' })
  await expect(sources.getByRole('radio')).toHaveText(['Все', 'Bybit · Основной', 'Вручную'])
  await expect(page.locator('[data-chart-whole]')).toHaveCount(0)
  await sources.getByRole('radio', { name: 'Вручную' }).click()
  // вручную — только ETH: 1 × 3 000 $
  await expect(page.locator('[data-hero]')).toHaveText('3 000,00 $')
  await expect(page.locator('[data-chart-whole]')).toContainText('весь портфель')
  await sources.getByRole('radio', { name: 'Все' }).click()
  await expect(page.locator('[data-chart-whole]')).toHaveCount(0)
})

test('быстрый уход мыши с графика на медленном компьютере — крупная цифра не застревает на точке', async ({ page, db, isMobile }) => {
  test.skip(isMobile, 'наведение мышью — только компьютер')
  await page.setViewportSize({ width: 1440, height: 900 })
  proPlus(db)
  await fakeSupabase(page, db)
  await page.goto('portfolio')
  const hero = page.locator('[data-hero]')
  await expect(hero).toHaveText('32 200,50 $')
  await expect(page.locator('[data-portfolio-chart] .recharts-area')).toBeVisible()
  // как в CI: браузер в 6 раз медленнее — движение мыши Recharts приходит уже после ухода с графика
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 })
  const box = (await page.locator('[data-portfolio-chart]').boundingBox())!
  for (let k = 0; k < 5; k++) {
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2)
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2, { steps: 4 })
    await page.mouse.move(0, 0)
    await expect(page.locator('[data-hero-scrub]')).toHaveCount(0)
    await expect(hero).toHaveText('32 200,50 $')
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
})
