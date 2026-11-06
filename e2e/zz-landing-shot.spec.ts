import { test, fakeSupabase } from './fixtures'
const OUT = process.env.SHOT_DIR!
for (const [vw, vh, tag] of [[1440, 900, 'desk'], [390, 844, 'mob']] as const) {
  test(`landing-${tag}`, async ({ page, db }) => {
    test.skip(!OUT)
    await page.setViewportSize({ width: vw, height: vh })
    await fakeSupabase(page, db, { signedIn: false })
    await page.goto('')
    await page.waitForTimeout(1500)
    // прокрутить вниз, чтобы сработали появления блоков
    for (let y = 0; y < 8000; y += 600) { await page.mouse.wheel(0, 600); await page.waitForTimeout(120) }
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${OUT}/landing-${tag}.png`, fullPage: true })
  })
}
