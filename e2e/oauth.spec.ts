// Вход через Google (docs/AUTH_GOOGLE.md): пока VITE_AUTH_GOOGLE не включён, кнопки нет — Supabase без провайдера ответил бы ошибкой
import { test, expect, fakeSupabase } from './fixtures'

test('без включённого Google на входе и регистрации только почта и пароль', async ({ page, db }) => {
  await fakeSupabase(page, db, { signedIn: false })
  for (const path of ['login', 'register']) {
    await page.goto(path)
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.locator('[data-oauth]')).toHaveCount(0)
  }
})
