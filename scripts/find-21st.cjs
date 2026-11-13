/**
 * Образцы интерфейса с 21st.dev (правило 8 в CLAUDE.md). Владелец разрешил брать оттуда компоненты.
 *
 *   node scripts/find-21st.cjs "pricing"                       — найти: ссылки на компоненты + снимок выдачи (21st-search.png)
 *   node scripts/find-21st.cjs "pricing" out.png               — то же, снимок в указанный файл
 *   node scripts/find-21st.cjs --code <ссылка на компонент>    — скачать превью компонента (HTML с собранным кодом) в 21st-<имя>.html
 *                                                                 + снимок превью 21st-<имя>.png
 *
 * Поиск на сайте работает только в браузере (выдача рисуется скриптом), поэтому здесь headless Chromium из Playwright
 * (в облачных сессиях уже установлен). Нужен доступ к хостам 21st.dev и cdn.21st.dev.
 * Скачанное — только образец: переписать под наши правила (токены theme.css, i18n, анимации из theme.css, без новых библиотек).
 * Файлы образцов в репозиторий не коммитить.
 */
const { chromium } = require('playwright')
const { writeFileSync } = require('node:fs')

async function search(page, q, shot) {
  // поиск по библиотеке ссылкой: qt — запрос, qs=downloads — сначала самые скачиваемые (проверенные людьми)
  const url = `https://21st.dev/community/components?qt=${encodeURIComponent(q)}&qs=downloads`
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(7000)
  console.log(`Выдача: ${url}`)
  const links = await page.$$eval('a[href]', (as) => [
    ...new Set(as.map((a) => a.getAttribute('href') || '').filter((h) => /^\/@[^/]+\/components\/[^?#]+$/.test(h))),
  ])
  for (const h of links.slice(0, 24)) console.log(`https://21st.dev${h}`)
  if (!links.length) console.log('Ничего не найдено (или сайт поменял вёрстку) — посмотри снимок выдачи.')
  await page.screenshot({ path: shot })
  console.log(`Снимок выдачи: ${shot}`)
}

async function code(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(6000)
  const src = await page.$$eval('iframe', (f) => f.map((x) => x.src).find((s) => s.includes('cdn.21st.dev')))
  if (!src) throw new Error('на странице нет превью с cdn.21st.dev')
  const name = (url.split('/components/')[1] || 'component').replace(/[^a-z0-9-]/gi, '_')
  const resp = await page.goto(src, { waitUntil: 'load', timeout: 60000 })
  if (!resp) throw new Error('превью не открылось')
  writeFileSync(`21st-${name}.html`, await resp.text())
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `21st-${name}.png`, fullPage: true })
  console.log(`Превью: ${src}\nКод (собранный HTML): 21st-${name}.html\nСнимок: 21st-${name}.png`)
}

;(async () => {
  const [a, b] = process.argv.slice(2)
  if (!a) {
    console.error('Usage: node scripts/find-21st.cjs "<query>" [shot.png] | --code <component url>')
    process.exit(1)
  }
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
  try {
    if (a === '--code') await code(page, b)
    else await search(page, a, b || '21st-search.png')
  } finally {
    await browser.close()
  }
})().catch((e) => {
  console.error('21st.dev: не получилось —', e.message)
  process.exit(1)
})
