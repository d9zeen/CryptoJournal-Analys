// Языки сайта: английский по умолчанию, русский — по переключателю; выбор запоминается
import { test, expect, fakeSupabase, makeTrade } from './fixtures'

test.describe('язык по умолчанию — английский', () => {
  // язык не выбран: сайт открывается так, как его видит новый человек
  test.use({ lang: null })

  test('главная, вход и регистрация на английском, <html lang="en">', async ({ page, db }) => {
    await fakeSupabase(page, db, { signedIn: false })
    await page.goto('')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Trading journal')
    await expect(page.getByRole('heading', { name: 'Pricing', level: 2 })).toBeVisible()
    await page.goto('login')
    await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible()
    await page.goto('register')
    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible()
  })

  test('переключатель EN | RU: русский на главной, выбор сохраняется после перезагрузки', async ({ page, db }) => {
    await fakeSupabase(page, db, { signedIn: false })
    await page.goto('')
    const group = page.getByRole('radiogroup', { name: 'Language' })
    await expect(group.getByRole('radio', { name: /^en$/i })).toHaveAttribute('aria-checked', 'true')
    await group.getByRole('radio', { name: /^ru$/i }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Дневник сделок')
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Дневник сделок')
    await expect(page.getByRole('radiogroup', { name: 'Язык' }).getByRole('radio', { name: /^ru$/i })).toHaveAttribute('aria-checked', 'true')
    // и обратно — одним нажатием
    await page.getByRole('radiogroup', { name: 'Язык' }).getByRole('radio', { name: /^en$/i }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Trading journal')
  })

  test('переключатель есть на входе', async ({ page, db }) => {
    await fakeSupabase(page, db, { signedIn: false })
    await page.goto('login')
    await page.getByRole('radiogroup', { name: 'Language' }).getByRole('radio', { name: /^ru$/i }).click()
    await expect(page.getByRole('heading', { name: 'Вход' })).toBeVisible()
  })
})

test.describe('в дневнике', () => {
  test.use({ lang: 'en' })

  test('дашборд на английском: подписи и числа в американском формате ($1,234.56)', async ({ page, db }) => {
    db.trades = [makeTrade(1, { pnl: 1234.56 }), makeTrade(2, { pnl: 100 })]
    await fakeSupabase(page, db)
    await page.goto('dashboard')
    await expect(page.getByRole('heading', { name: 'Statistics' })).toBeVisible()
    await expect(page.getByText('+$1,334.56').first()).toBeVisible()
  })

  test('язык меняется в «Настройки → Оформление»', async ({ page, db }) => {
    await fakeSupabase(page, db)
    await page.goto('settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    // в «Оформлении» — полные названия языков
    await page.getByRole('radio', { name: 'Русский' }).click()
    await expect(page.getByRole('heading', { name: 'Настройки' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
  })
})

test.describe('главная на английском (как у нового человека)', () => {
  test.use({ lang: null })

  test('биржи двумя честными строками, «How it works», 8 вопросов, неделя сделки с подписью', async ({ page, db }) => {
    await fakeSupabase(page, db, { signedIn: false })
    await page.goto('')
    const ex = page.getByRole('region', { name: 'Works with' })
    await expect(ex.getByText('Auto-sync via API')).toBeVisible()
    await expect(ex.getByText('Upload CSV / Excel')).toBeVisible()
    for (const name of ['Bybit', 'Hyperliquid', 'Polymarket', 'Binance', 'OKX', 'BingX', 'Bitget', 'MEXC', 'any other exchange']) await expect(ex.getByText(name, { exact: true })).toBeVisible()
    await expect(page.getByText(/Coming via API/)).toHaveCount(0)
    // шаг 3 — неделя: 7 дней, день сделки выделен, итог недели и подпись из данных демо
    const path = page.locator('#features')
    await path.scrollIntoViewIfNeeded()
    await expect(path.locator('[data-day]')).toHaveCount(7)
    await expect(path.locator('[data-day].ring-2')).toHaveCount(1)
    await expect(path.getByText('Week total')).toBeVisible()
    await expect(path.locator('[data-caption]')).toHaveText(/^[A-Z][a-z]{2} \d{1,2}: −\$61\.20, one trade without a stop$/)
    await expect(page.locator('#faq details')).toHaveCount(8)
    await expect(page.getByText('Do I need a card for the trial?')).toBeVisible()
    if ((page.viewportSize()?.width ?? 0) >= 768) {
      await page.getByRole('link', { name: 'How it works' }).click()
      await expect(page).toHaveURL(/#features$/)
    }
  })

  test('шапка телефона: «Start free» вместо «Log in», всё помещается на 360px', async ({ page, db }) => {
    await page.setViewportSize({ width: 360, height: 760 })
    await fakeSupabase(page, db, { signedIn: false })
    await page.goto('')
    const header = page.locator('header')
    await expect(header.getByRole('link', { name: 'Start free' })).toBeVisible()
    await expect(header.getByRole('link', { name: 'Log in' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Log in' }).first()).toBeVisible() // на первом экране
    const box = (await header.getByRole('link', { name: 'Start free' }).boundingBox())!
    expect(box.x + box.width).toBeLessThanOrEqual(360)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
  })

  test('тарифы: карточки одной высоты, кнопки на одной линии, описание под ценой', async ({ page, db, isMobile }) => {
    test.skip(isMobile, 'на телефоне карточки друг под другом')
    await fakeSupabase(page, db, { signedIn: false })
    for (const width of [1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.goto('')
      await page.locator('[data-plan="pro_plus"]').scrollIntoViewIfNeeded()
      for (const hover of [null, 'free', 'pro']) {
        if (hover) await page.locator(`[data-plan="${hover}"]`).hover()
        else await page.mouse.move(1, 1)
        await page.waitForTimeout(700)
        // высота без учёта scale / translate (offsetHeight) и место кнопки внутри карточки
        const m = await page.locator('[data-plan]').evaluateAll((els) =>
          els.map((el) => {
            const card = el as HTMLElement
            const btn = card.querySelector('a') as HTMLElement
            return { h: card.offsetHeight, btn: btn.getBoundingClientRect().bottom - card.getBoundingClientRect().top, scale: card.getBoundingClientRect().height / card.offsetHeight }
          }),
        )
        expect(new Set(m.map((x) => x.h)).size, `ширина ${width}, мышка на ${hover ?? 'ничём'}`).toBe(1)
        const btnBottom = m.map((x) => x.btn / x.scale)
        expect(Math.max(...btnBottom) - Math.min(...btnBottom)).toBeLessThan(2)
      }
    }
    // один и тот же список из 8 строк; чего нет в тарифе — ✕, зачёркнуто, для экранных чтецов «not included»
    for (const [id, off] of [
      ['free', 4],
      ['pro', 2],
      ['pro_plus', 0],
    ] as const) {
      const items = page.locator(`[data-plan="${id}"] li`)
      await expect(items).toHaveCount(8)
      await expect(page.locator(`[data-plan="${id}"] li[data-on="false"]`)).toHaveCount(off)
      await expect(page.locator(`[data-plan="${id}"] li[data-on="false"] .line-through`)).toHaveCount(off)
      await expect(page.locator(`[data-plan="${id}"] li[data-on="false"]`).filter({ hasText: 'not included' })).toHaveCount(off)
    }
    await expect(page.locator('[data-plan="free"] li').nth(0)).toHaveText('50 trades per month')
    await expect(page.locator('[data-plan="pro_plus"] li').nth(0)).toHaveText('Unlimited trades')
    await expect(page.locator('[data-plan="free"] li').nth(3)).toContainText('Polymarket via wallet address')
    await expect(page.locator('[data-plan="pro_plus"] li').nth(3)).toHaveText('Polymarket via wallet address')
    // описание — под ценой, до списка
    const card = page.locator('[data-plan="pro"]')
    const desc = (await card.getByText('For traders on one exchange.').boundingBox())!
    const list = (await card.locator('ul').boundingBox())!
    expect(desc.y).toBeLessThan(list.y)
  })

  test('тарифы: строки списков стоят друг напротив друга, «Free / forever» в строке цены', async ({ page, db, isMobile }) => {
    test.skip(isMobile, 'на телефоне карточки друг под другом')
    await fakeSupabase(page, db, { signedIn: false })
    for (const [width, height] of [
      [1440, 900],
      [1920, 1080],
    ] as const) {
      await page.setViewportSize({ width, height })
      await page.goto('')
      await page.locator('[data-plan="pro_plus"]').scrollIntoViewIfNeeded()
      await page.mouse.move(1, 1) // без мышки впереди Pro Plus (поднята на 20px — так задумано)
      await page.waitForTimeout(800)
      const free = page.locator('[data-plan="free"]')
      await expect(free.locator('[data-price]')).toHaveText(/^Free\s*\/ forever$/)
      await expect(free.getByText('free forever')).toHaveCount(0)
      // верх каждой строки списка у Basic и Pro — на одной линии (±2px)
      const tops = async (id: string) => page.locator(`[data-plan="${id}"] li`).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top))
      const a = await tops('free')
      const b = await tops('pro')
      expect(a).toHaveLength(8)
      for (let i = 0; i < 8; i++) expect(Math.abs(a[i] - b[i]), `ширина ${width}, строка ${i + 1}`).toBeLessThanOrEqual(2)
      // внутри карточки (без учёта подъёма и масштаба 94 %) строки стоят одинаково у всех трёх, Pro Plus тоже
      const inside = async (id: string) => page.locator(`[data-plan="${id}"] li`).evaluateAll((els) => els.map((e) => (e as HTMLElement).offsetTop))
      const [x, y, z] = [await inside('free'), await inside('pro'), await inside('pro_plus')]
      for (let i = 0; i < 8; i++) expect(Math.max(x[i], y[i], z[i]) - Math.min(x[i], y[i], z[i]), `ширина ${width}, строка ${i + 1} внутри карточек`).toBeLessThanOrEqual(2)
    }
  })
})

