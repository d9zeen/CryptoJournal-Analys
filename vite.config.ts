/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

/**
 * Защита страницы в браузере (только в боевой сборке — в dev мешала бы горячей перезагрузке).
 * GitHub Pages не умеет отдавать свои заголовки, поэтому политику кладём в <meta>.
 * CSP: скрипты — только наши файлы (никаких чужих скриптов и inline-кода),
 * сеть — только наш сайт, наш Supabase и публичный API Hyperliquid (история сделок по адресу кошелька), картинки — наши, Supabase и data:/blob: (QR-код, превью).
 */
function securityMeta(supabaseUrl: string): Plugin {
  const origin = supabaseUrl ? new URL(supabaseUrl).origin : ''
  const wss = origin.replace(/^https:/, 'wss:')
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${origin}`,
    `connect-src 'self' ${origin} ${wss} https://api.hyperliquid.xyz`,
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-src 'none'",
    "worker-src 'self' blob:",
    'upgrade-insecure-requests',
  ].join('; ')
  return {
    name: 'security-meta',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />\n    <meta name="referrer" content="strict-origin-when-cross-origin" />`,
      )
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env }
  return {
    // Подпапка сайта. Локально и на Cloudflare — '/'; на GitHub Pages сборка получает BASE_PATH=/CryptoJournal-Analys/
    base: process.env.BASE_PATH || '/',
    plugins: [react(), tailwindcss(), securityMeta(env.VITE_SUPABASE_URL ?? '')],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    build: {
      sourcemap: false, // исходники не выкладываем
      // шрифты — всегда отдельными файлами: встроенные data:-шрифты блокирует CSP (font-src 'self')
      assetsInlineLimit: (file) => (file.endsWith('.woff2') || file.endsWith('.woff') ? false : undefined),
    },
    test: {
      // тесты логики — только в src; сквозные (e2e/) запускает Playwright: npm run test:e2e
      include: ['src/**/*.test.ts', 'supabase/functions/**/*.test.ts'],
      // тесты написаны под русские тексты и форматы; английские проверяются отдельно (setLang('en') в самом тесте)
      setupFiles: ['src/test-setup.ts'],
    },
  }
})
