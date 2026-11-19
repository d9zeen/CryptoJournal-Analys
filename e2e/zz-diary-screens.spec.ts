/**
 * Снимки экранов дневника для блока «Как выглядит дневник изнутри» на главной (features/landing/DiaryTabs.tsx).
 * Не тест: запускается только с GEN_SCREENS=1 — `npm run shots:diary`. Пересобирать, когда заметно поменялись
 * форма сделки, список сделок, «Разбор» или «График сделки».
 *
 * Демо-счёт тот же, что у кнопки «Открыть демо» (features/demo), но цены — правдоподобные по каждой монете
 * (фейковые свечи ниже), а названия сетапов / ошибок / эмоций — на языке снимка.
 * Файлы: src/assets/landing/diary/{trade|list|analysis|chart}-{light|dark}-{ru|en}-{desk|phone}.jpg
 */
import { test, fakeSupabase } from './fixtures'

const OUT = 'src/assets/landing/diary'
const BASE: Record<string, number> = {
  BTCUSDT: 91840, ETHUSDT: 3085, SOLUSDT: 142.3, TONUSDT: 2.08, XRPUSDT: 2.21, DOGEUSDT: 0.1612, BNBUSDT: 902.5, SUIUSDT: 1.62, LINKUSDT: 13.4, AVAXUSDT: 14.1,
}
const NAMES = {
  ru: {
    setups: ['Пробой уровня', 'Отбой от уровня', 'Ретест', 'По тренду'],
    mistake_tags: ['Поздний вход', 'Без стопа', 'Двинул стоп'],
    emotions: ['Спокоен', 'Уверен', 'Страх', 'Жадность', 'Азарт', 'Тильт'],
  },
  en: {
    setups: ['Breakout', 'Level bounce', 'Retest', 'With the trend'],
    mistake_tags: ['Late entry', 'No stop', 'Moved the stop'],
    emotions: ['Calm', 'Confident', 'Fear', 'Greed', 'Excitement', 'Tilt'],
  },
}

for (const device of ['desk', 'phone'] as const)
  // язык браузера (им рисуются поля даты и времени) задаёт окружение — поэтому языки по очереди, отдельными запусками (SHOT_LANG, см. package.json)
  for (const lang of [process.env.SHOT_LANG === 'en' ? 'en' : 'ru'] as const)
  test.describe(`снимки дневника: ${device} ${lang}`, () => {
    // в двойной чёткости — для плотных экранов (телефоны, Retina); браузер — на языке снимка (поля даты и времени рисует он сам)
    test.use({
      deviceScaleFactor: 2,
      locale: lang === 'ru' ? 'ru-RU' : 'en-US',
      timezoneId: 'Europe/Moscow',
    })
    for (const theme of ['light', 'dark'] as const)
      test(theme, async ({ page, db }) => {
        test.skip(!process.env.GEN_SCREENS, 'только по команде npm run shots:diary')
        test.setTimeout(120_000)
        if (device === 'desk') await page.setViewportSize({ width: 1280, height: 800 })
        else await page.setViewportSize({ width: 390, height: 760 })
        await page.addInitScript(
          ([t, l]) => {
            try {
              localStorage.setItem('cj-theme-v2', t)
              localStorage.setItem('cj-lang', l)
            } catch {
              /* нет хранилища */
            }
          },
          [theme, lang],
        )
        db.usage = { plan: 'pro_plus', trades_created: 0, trade_limit: null }
        await fakeSupabase(page, db, { signedIn: false })

        // списки: при раскладке демо — русские (по ним seed.ts находит ошибки), на снимках — на языке снимка (те же id)
        let names = NAMES.ru
        for (const table of ['setups', 'mistake_tags', 'emotions'] as const)
          await page.route(`https://fake.supabase.test/rest/v1/${table}*`, (route) =>
            route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify(names[table].map((name, i) => ({ id: `${table}-${i}`, user_id: '', name, archived: false, sort_order: i, created_at: '' }))),
            }),
          )
        // свечи Bybit: правдоподобная цена у каждой монеты (одинаково при каждом запуске)
        await page.route(/^https:\/\/api\.bybit\.com\/v5\/market\/kline/, (route) => {
          const q = new URL(route.request().url()).searchParams
          const ms = ({ '1': 6e4, '5': 3e5, '15': 9e5, '60': 36e5, '240': 144e5, D: 864e5 } as Record<string, number>)[q.get('interval') ?? '60'] ?? 36e5
          const base = BASE[q.get('symbol') ?? ''] ?? 100
          const from = Number(q.get('start'))
          const to = Number(q.get('end'))
          const p = (x: number) => base * (1 + Math.sin(x / 40) * 0.012 + Math.sin(x / 9) * 0.005 + Math.sin(x / 2.3 + 1) * 0.0018)
          const rows: string[][] = []
          for (let t = Math.ceil(from / ms) * ms; t < to && rows.length < 1000; t += ms) {
            const x = t / 6e4 // время в минутах — одна и та же кривая на любом таймфрейме
            const o = p(x)
            const c = p(x + ms / 6e4)
            rows.push([String(t), String(o), String(Math.max(o, c) * 1.0008), String(Math.min(o, c) * 0.9992), String(c)])
          }
          return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ retCode: 0, result: { list: rows.reverse() } }) })
        })

        await page.goto('demo')
        await page.waitForURL(/dashboard/)
        names = NAMES[lang]
        // ошибки сделок — как их отдала бы база (фейк сам не склеивает trade_mistakes)
        const tm = db.inserted.filter((x) => x.table === '/rest/v1/trade_mistakes').flatMap((x) => x.body as { trade_id: string; tag_id: string }[])
        db.trades = db.trades.map((t) => ({ ...t, trade_mistakes: tm.filter((m) => m.trade_id === t.id).map((m) => ({ tag_id: m.tag_id })) }))

        // без меню дневника и плашки демо: на главной экран стоит в своём окне
        // и без того, что на снимке только мешает: липкая «Отмена / Сохранить» поверх формы, строка «в демо скриншоты не загружаются»
        const chrome = '[data-demo-banner], header, body > div nav, [data-activity], [data-trade-actions], [data-guest-line] { display: none !important } main { padding-top: 20px !important }'
        const shot = async (path: string, name: string, prepare?: () => Promise<void>) => {
          await page.goto(path)
          await page.addStyleTag({ content: chrome })
          await page.waitForTimeout(1500)
          if (prepare) await prepare()
          await page.waitForTimeout(600)
          await page.screenshot({ path: `${OUT}/${name}-${theme}-${lang}-${device}.jpg`, type: 'jpeg', quality: 70 })
        }
        const byExt = (k: number) => db.trades.find((x) => x.external_id === `demo:${k}`)!
        const demo = db.trades.filter((x) => String(x.external_id).startsWith('demo:'))
        // «Запись сделки» — убыточная сделка с отмеченной ошибкой (видно, что дневник считает и что ты отметил)
        const withMistake = demo.find((x) => (x.trade_mistakes as unknown[]).length > 0 && Number(x.pnl) < 0 && x.stop_loss !== null) ?? byExt(5)
        // «График сделки» — заметная прибыльная сделка со стопом
        const best = [...demo].filter((x) => x.stop_loss !== null).sort((a, b) => Number(b.pnl) - Number(a.pnl))[2] ?? byExt(10)

        await shot('trades', 'list')
        // «Пары»: 10 строк, полоски в плюс и в минус; строка-вывод над вкладками называет и лучший сетап, и самую дорогую ошибку
        await shot('analysis?tab=pairs', 'analysis', async () => {
          // лента карточек со скриншотами — у демо-сделок скриншотов нет; на снимке — вывод, вкладки и таблица
          await page.addStyleTag({ content: '[data-shot="group-trades"] { display: none !important }' })
        })
        await shot(`trades/${withMistake.id}`, 'trade')
        await shot(`trades/${best.id}`, 'chart', async () => {
          const chart = page.locator('[data-trade-chart]')
          await chart.waitFor()
          await page.evaluate(() => {
            const el = document.querySelector('[data-trade-chart]') as HTMLElement
            window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 16)
          })
          await page.waitForTimeout(2600) // линия рисуется («шторка»)
        })
      })
  })
