// Скриншоты главной для PR (не тест): SHOT_DIR=папка npx playwright test zz-landing-shot --project=desktop
import { test, fakeSupabase } from './fixtures'
const OUT = process.env.SHOT_DIR!
for (const theme of ['dark', 'light'] as const) {
  for (const [vw, vh, tag] of [[1440, 900, 'desk'], [390, 844, 'mob']] as const) {
    test(`landing-${tag}-${theme}`, async ({ page, db }) => {
      test.skip(!OUT)
      await page.setViewportSize({ width: vw, height: vh })
      await page.addInitScript((t) => {
        try {
          localStorage.setItem('cj-theme-v2', t)
        } catch {
          /* нет хранилища */
        }
      }, theme)
      await fakeSupabase(page, db, { signedIn: false })
      await page.goto('')
      await page.waitForTimeout(1500)
      // прокрутить вниз, чтобы сработали появления блоков
      for (let y = 0; y < 9000; y += 500) {
        await page.mouse.wheel(0, 500)
        await page.waitForTimeout(120)
      }
      // наверх: иначе «липкая» шапка окажется посреди снимка всей страницы
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.waitForTimeout(900)
      await page.screenshot({ path: `${OUT}/landing-${tag}-${theme}.png`, fullPage: true })
    })
  }
}

// hero крупно (чёткость ×2)
for (const theme of ['dark', 'light'] as const) {
  test(`hero-${theme}`, async ({ browser, db }) => {
    test.skip(!OUT)
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 760 }, deviceScaleFactor: 2 })
    const page = await ctx.newPage()
    await page.addInitScript((t) => {
      try {
        localStorage.setItem('cj-theme-v2', t)
      } catch {
        /* нет хранилища */
      }
    }, theme)
    await fakeSupabase(page, db, { signedIn: false })
    await page.goto('')
    await page.waitForTimeout(1800)
    await page.screenshot({ path: `${OUT}/hero-${theme}.png` })
    await ctx.close()
  })
}
