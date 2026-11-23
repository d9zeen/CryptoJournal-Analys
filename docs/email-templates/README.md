# Письма Supabase на двух языках

Сайт сам запоминает язык человека в аккаунте (`user_metadata.lang`: при регистрации и при переключении EN | RU).
Шаблоны ниже показывают английский текст, если `lang = en`, иначе — русский (у старых аккаунтов языка нет — им по-русски).

## Как вставить (один раз, 5 минут)

Supabase → проект **cryptojournal** → **Authentication → Emails (Email Templates)**. Для каждого письма:

| Письмо в Supabase | Тема (Subject) | Текст (Body) — содержимое файла |
|---|---|---|
| Confirm signup | `Подтвердите почту · Confirm your email — CryptoHex` | `confirm-signup.html` |
| Reset Password | `Сброс пароля · Reset your password — CryptoHex` | `reset-password.html` |
| Change Email Address | `Новая почта · Confirm new email — CryptoHex` | `change-email.html` |
| Magic Link | `Вход · Sign in — CryptoHex` | `magic-link.html` |

Скопировать файл целиком → вставить в поле Body → **Save**. Тема — на двух языках сразу (в теме выбор по языку Supabase не поддерживает).

Важно: встроенная почта Supabase отправляет мало писем и не всем адресам — перед запуском нужен свой SMTP (Resend / Brevo), см. docs/PLAN.md.
