// Тема до первой отрисовки, чтобы не мигал фон. Логика — как readTheme / applyTheme в src/lib/theme.ts.
// Светлая по умолчанию; тёмная — только если пользователь её выбрал (cj-theme = 'dark').
;(function () {
  var dark = false
  try {
    dark = localStorage.getItem('cj-theme') === 'dark'
  } catch (e) {
    // хранилище недоступно — остаётся светлая по умолчанию
  }
  if (!dark) document.documentElement.dataset.theme = 'light'
  var m = document.querySelector('meta[name="theme-color"]')
  if (m) m.setAttribute('content', dark ? '#17181b' : '#efe9dc')
})()
