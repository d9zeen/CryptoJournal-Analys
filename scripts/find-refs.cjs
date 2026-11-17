/**
 * Дизайн-референсы с сайтов, которые выбрал владелец (17.11.2026) — смотреть ВМЕСТЕ с 21st.dev (правило 8 в CLAUDE.md):
 *   - styles.refero.design — стили настоящих сайтов: палитра, шрифты, сетка, компоненты (поиск по словам на сайте из облака не работает —
 *                            их API отвечает 403 автоматическому браузеру; тогда скрипт берёт подборки Trending / Popular / Newest);
 *   - recent.design        — свежая подборка: интерфейсы, сайты, брендинг, моушн;
 *   - deck.gallery         — презентации и слайды (из облака не открывается: проверка Cloudflare «я человек» — смотреть нельзя, не обходить).
 *
 *   node scripts/find-refs.cjs "fintech dashboard"       — Refero: ссылки на стили + снимок выдачи (ref-refero.png);
 *                                                         recent.design: ссылки на работы + снимок ленты «Interface» (ref-recent.png)
 *   node scripts/find-refs.cjs --open <ссылка>           — открыть страницу стиля / работы и снять её целиком (ref-page.png)
 *
 * Headless Chromium из Playwright (в облачных сессиях уже есть). Нужен доступ к хостам: styles.refero.design, images.refero.design,
 * recent.design, cdn.recent.design, api.recent.design (окружение «GitHub» — добавлены 17.11.2026).
 * Референс — только направление: делаем своё на токенах theme.css, тексты через i18n, без новых библиотек. Снимки ref-* не коммитить.
 */
const { chromium } = require('playwright')

async function refero(page, q) {
  const url = `https://styles.refero.design/?q=${encodeURIComponent(q)}`
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(6000)
  const styles = () =>
    page.$$eval('a[href^="/style/"]', (as) => {
      const seen = new Map()
      for (const a of as) {
        const h = a.getAttribute('href')
        const t = (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80)
        if (!seen.has(h) || (!seen.get(h) && t)) seen.set(h, t)
      }
      return [...seen]
    })
  let found = await styles()
  console.log(`Refero: ${url}`)
  if (!found.length) {
    // поиск Refero не пускает автоматический браузер (их API отвечает 403) — берём подборки Trending / Popular / Newest и ищем слова в названиях
    console.log('  поиск сайта недоступен из облака — смотрю подборки Trending / Popular / Newest')
    await page.goto('https://styles.refero.design/', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(5000)
    found = await styles()
    for (const tab of ['Popular', 'Newest']) {
      await page.getByRole('button', { name: new RegExp(`^${tab}$`) }).click().catch(() => {})
      await page.waitForTimeout(3000)
      for (const x of await styles()) if (!found.some(([h]) => h === x[0])) found.push(x)
    }
  }
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
  const hit = (t) => words.some((w) => t.toLowerCase().includes(w))
  found.sort((a, b) => Number(hit(b[1])) - Number(hit(a[1])))
  for (const [h, t] of found.slice(0, 16)) console.log(`  https://styles.refero.design${h}  ${t}${hit(t) ? '  ← по запросу' : ''}`)
  await page.screenshot({ path: 'ref-refero.png' })
  console.log('  снимок: ref-refero.png')
}

async function recent(page, q) {
  await page.goto('https://recent.design/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3000)
  // у recent.design нет поиска по словам — берём ленту «Interface» и отбираем работы, в названии которых есть слова запроса
  await page.getByRole('button', { name: /^Interface$/ }).click().catch(() => {})
  await page.waitForTimeout(5000)
  const items = await page.$$eval('a[href^="/i/"]', (as) => [...new Set(as.map((a) => a.getAttribute('href')))])
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
  const hit = items.filter((h) => words.some((w) => h.toLowerCase().includes(w)))
  console.log('recent.design (лента Interface):')
  for (const h of [...hit, ...items.filter((h) => !hit.includes(h))].slice(0, 12)) console.log(`  https://recent.design${h}${hit.includes(h) ? '  ← по запросу' : ''}`)
  await page.screenshot({ path: 'ref-recent.png' })
  console.log('  снимок: ref-recent.png')
}

;(async () => {
  const args = process.argv.slice(2)
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  try {
    if (args[0] === '--open') {
      await page.goto(args[1], { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForTimeout(6000)
      await page.screenshot({ path: 'ref-page.png', fullPage: true })
      console.log(`Снимок страницы: ref-page.png (${await page.title()})`)
    } else {
      const q = args.join(' ') || 'dashboard'
      await refero(page, q)
      await recent(page, q)
    }
  } finally {
    await browser.close()
  }
})()
