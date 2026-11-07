// Тема до первой отрисовки, чтобы не мигал фон. Логика — как readTheme / applyTheme в src/lib/theme.ts.
;(function () {
  try {
    if (localStorage.getItem('cj-theme') === 'light') {
      document.documentElement.dataset.theme = 'light'
      var m = document.querySelector('meta[name="theme-color"]')
      if (m) m.setAttribute('content', '#efe9dc')
    }
  } catch (e) {
    // хранилище недоступно — остаётся тёмная по умолчанию
  }
})()
