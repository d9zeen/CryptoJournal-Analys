// Тема до первой отрисовки, чтобы не мигал фон. Логика — как readTheme / applyTheme в src/lib/theme.ts.
// Светлая по умолчанию; тёмная — только если пользователь её выбрал (cj-theme-v2 = 'dark'; ключ как в src/lib/theme.ts).
;(function () {
  var dark = false
  try {
    dark = localStorage.getItem('cj-theme-v2') === 'dark'
  } catch (e) {
    // хранилище недоступно — остаётся светлая по умолчанию
  }
  if (!dark) document.documentElement.dataset.theme = 'light'
  var m = document.querySelector('meta[name="theme-color"]')
  if (m) m.setAttribute('content', dark ? '#17181b' : '#efe9dc')
})()
// Язык до первой отрисовки: <html lang> (для экранных дикторов и переносов). Ключ и значения — как в src/lib/locale.ts, по умолчанию английский.
;(function () {
  try {
    var l = localStorage.getItem('cj-lang')
    if (l === 'ru' || l === 'en') document.documentElement.lang = l
  } catch (e) {
    // хранилище недоступно — остаётся lang="en" из index.html
  }
})()
