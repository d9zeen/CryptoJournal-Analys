/**
 * Сквозные тесты (Playwright): настоящая боевая сборка сайта (с CSP) в браузере,
 * Supabase подменён «фейковым» сервером в памяти (e2e/fixtures.ts) — настоящая база не трогается.
 * Запуск: npm run test:e2e
 */
import { defineConfig, devices } from '@playwright/test'

const PORT = 4173
const BASE = '/CryptoJournal-Analys/'

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}${BASE}`,
    trace: 'retain-on-failure',
    // в облачной среде Claude браузер уже установлен здесь; в CI — обычная установка Playwright
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `npx vite build && npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}${BASE}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      BASE_PATH: BASE,
      VITE_SUPABASE_URL: 'https://fake.supabase.test',
      VITE_SUPABASE_ANON_KEY: 'e2e-anon-key',
    },
  },
})
