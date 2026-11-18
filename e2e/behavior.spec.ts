// «Разбор → Поведение» (18.11.2026): серия убытков перед входом, время в сделке, стоп указан / нет
import { test, expect, fakeSupabase, makeTrade, type FakeDb } from './fixtures'

const SHOTS = process.env.SHOTS_DIR

/** 12 сделок подряд, по 2 часа; пары по исходу: L L L W, L L W W, … — серии 2+ бывают; часть короткие, часть со стопом */
function seed(db: FakeDb, withStops: boolean) {
  const start = Date.UTC(2026, 10, 2, 8)
  const outcome = [-1, -1, -1, 1, -1, -1, 1, 1, -1, 1, 1, -1]
  db.trades = outcome.map((o, i) => {
    const entry = new Date(start + i * 2 * 3_600_000)
    const exit = new Date(entry.getTime() + (i % 3 === 0 ? 10 * 60_000 : 90 * 60_000))
    return makeTrade(i, {
      entry_at: entry.toISOString(),
      exit_at: exit.toISOString(),
      pnl: o > 0 ? 80 + i : -(40 + i),
      stop_loss: withStops && i % 2 === 0 ? 99 : null,
    })
  })
}

test('«Поведение»: серия убытков и время в сделке по порядку, вывод, выбор строки отбирает сделки', async ({ page, db }) => {
  seed(db, false)
  await fakeSupabase(page, db)
  await page.goto('analysis?tab=behavior')
  await expect(page.getByRole('tab', { name: /Поведение/ })).toHaveAttribute('aria-selected', 'true')
  // на телефоне капсула листается вбок — выбранная вкладка видна целиком
  await expect
    .poll(() =>
      page.getByRole('tablist').evaluate((strip) => {
        const a = strip.querySelector('[aria-selected="true"]')!.getBoundingClientRect()
        const s = strip.getBoundingClientRect()
        return a.left >= s.left - 1 && a.right <= s.right + 1
      }),
    )
    .toBe(true)

  const streak = page.locator('[data-behavior-table="streak"]')
  await expect(streak.getByRole('heading', { name: 'После серии убытков' })).toBeVisible()
  // строки — в естественном порядке серии, а не по PnL
  await expect(streak.locator('[data-row]')).toHaveText([/После прибыли или первой сделки/, /После 1 убытка/, /После 2 убытков подряд/, /После 3 и больше/])
  await expect(page.locator('[data-behavior-table="hold"] [data-row]')).toHaveText([/До 15 минут/, /1–4 часа/])
  // стоп ни у кого не указан — сравнивать нечего, таблицы нет
  await expect(page.locator('[data-behavior-table="stop"]')).toHaveCount(0)
  await expect(page.locator('[data-behavior-insight]')).toContainText('После 2 и больше убытков подряд винрейт')

  // выбор строки: в ленте остаются только её сделки (после 3+ убытков — одна, № 3)
  await expect(page.locator('[data-trade-card]')).toHaveCount(12)
  await streak.locator('[data-row="streak:3+"]').click()
  await expect(page.locator('[data-trade-card]')).toHaveCount(1)
  await streak.locator('[data-row="streak:3+"]').click()
  await expect(page.locator('[data-trade-card]')).toHaveCount(12)
})

test('«Поведение»: стоп указан у части сделок — третья таблица; снимки', async ({ page, db }, info) => {
  seed(db, true)
  await fakeSupabase(page, db)
  await page.goto('analysis?tab=behavior')
  await expect(page.locator('[data-behavior-table="stop"] [data-row]')).toHaveText([/Стоп указан/, /Стоп не указан/])
  // суммы видны целиком
  const clipped = await page.locator('[data-behavior-table] [data-money]').evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).length)
  expect(clipped).toBe(0)
  if (SHOTS) {
    for (const theme of ['light', 'dark']) {
      await page.evaluate((th) => document.documentElement.setAttribute('data-theme', th), theme)
      await page.waitForTimeout(400)
      await page.screenshot({ path: `${SHOTS}/behavior-${info.project.name}-${theme}.png`, fullPage: true })
    }
  }
})
