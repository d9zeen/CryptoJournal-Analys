import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/theme.css'
import { App } from './App'

// Защита от «кликджекинга»: сайт не работает внутри чужой страницы (iframe).
// Заголовок frame-ancestors на GitHub Pages задать нельзя, поэтому проверяем в коде.
if (window.top !== window.self) {
  document.body.textContent = ''
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
