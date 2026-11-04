import { test, expect, fakeSupabase } from './fixtures'

// Chrome сам не пускает страницу-«чужака» в локальную сеть (localhost) — отключаем эту проверку браузера,
// чтобы проверить именно нашу защиту от встраивания
test.use({ launchOptions: { args: ['--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests'] } })

test('сайт не работает внутри чужой страницы (iframe)', async ({ page, db, baseURL }) => {
  await fakeSupabase(page, db, { signedIn: false })
  // «чужой» сайт на другом адресе (localhost — для браузера это другой сайт, чем 127.0.0.1) встраивает наш в рамку
  const evil = baseURL!.replace('127.0.0.1', 'localhost').replace(/CryptoJournal-Analys\/$/, 'evil.html')
  await page.route(evil, (r) => r.fulfill({ contentType: 'text/html', body: `<iframe src="${baseURL}login" width="800" height="600"></iframe>` }))
  await page.goto(evil)
  await page.waitForTimeout(2000)
  const framed = page.frames()[1]
  // наш сайт в рамке загрузился (адрес и заголовок вкладки наши)…
  expect(framed.url()).toContain('127.0.0.1')
  expect(await framed.title()).toContain('CryptoJournal')
  // …но ничего не показал
  await expect(page.frameLocator('iframe').getByRole('heading', { name: 'Вход' })).toHaveCount(0)
})

test('контроль: без рамки та же страница показывает вход', async ({ page, db }) => {
  await fakeSupabase(page, db, { signedIn: false })
  await page.goto('login')
  await expect(page.getByRole('heading', { name: 'Вход' })).toBeVisible()
})
