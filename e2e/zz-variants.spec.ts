/** ВРЕМЕННО: скриншоты вариантов оформления блоков (только с SHOT_DIR) — для выбора владельцем */
import { test, fakeSupabase, makeTrade } from './fixtures'
const OUT = process.env.SHOT_DIR
function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const trades = () => {
  const rnd = seeded(20261106)
  return Array.from({ length: 60 }, (_, i) => {
    const slump = i >= 24 && i <= 33
    const win = rnd() < (slump ? 0.25 : 0.62)
    const size = win ? 40 + rnd() * 230 : 30 + rnd() * (slump ? 190 : 120)
    const pnl = Math.round((win ? size : -size) * 100) / 100
    return makeTrade(i, { pnl, r_multiple: Math.round((pnl / 90) * 100) / 100 })
  })
}
const SHOTS: [string, string, string][] = [
  ['kpi', 'a', '[data-shot="kpi"]'], ['kpi', 'b', '[data-shot="kpi"]'], ['kpi', 'c', '[data-shot="kpi"]'],
  ['keys', 'a', '[data-shot="keys"]'], ['keys', 'b', '[data-shot="keys"]'], ['keys', 'c', '[data-shot="keys"]'],
  ['bars', 'a', 'bars'], ['bars', 'b', 'bars'], ['bars', 'c', 'bars'], ['bars', 'd', 'bars'],
]
for (const [block, v, sel] of SHOTS) {
  test(`${block}-${v}`, async ({ page, db }) => {
    test.skip(!OUT)
    await page.setViewportSize({ width: 1440, height: 1300 })
    await page.addInitScript(([b, x]) => localStorage.setItem(`cj-v-${b}`, x), [block, v])
    db.trades = trades()
    await fakeSupabase(page, db)
    await page.goto('dashboard')
    await page.waitForTimeout(2500)
    const el = sel === 'bars' ? page.getByRole('heading', { name: 'PnL по дням' }).locator('xpath=ancestor::div[contains(@class,"rise")][1]') : page.locator(sel)
    await el.screenshot({ path: `${OUT}/${block}-${v}.png` })
  })
}
