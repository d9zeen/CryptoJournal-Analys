# Вход через Google — как включить (для владельца)

Код уже на сайте, но кнопка «Продолжить с Google» спрятана, пока Google не включён в Supabase.
Без этого Supabase ответит ошибкой, и кнопка только сбила бы человека с толку.

## 1. Google Cloud (10 минут)
1. https://console.cloud.google.com → создать проект, например `CryptoJournal`.
2. **APIs & Services → OAuth consent screen**:
   - тип **External**;
   - название приложения `CryptoJournal`, почта поддержки — твоя;
   - домен приложения можно пока не заполнять;
   - доступы (scopes) — только `email`, `profile`, `openid`;
   - нажать **Publish app**, иначе войти смогут только тестовые аккаунты.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - тип **Web application**;
   - **Authorized JavaScript origins:** `https://d9zeen.github.io`
   - **Authorized redirect URIs:** `https://dkjavndvuulnzflowdhj.supabase.co/auth/v1/callback`
4. Скопировать **Client ID** и **Client secret**. Секрет никому не пересылать и в чат не вставлять.

## 2. Supabase (2 минуты)
1. **Authentication → Sign In / Providers → Google** → Enable, вставить Client ID и Client secret → Save.
2. **Authentication → URL Configuration → Redirect URLs** → добавить `https://d9zeen.github.io/CryptoJournal-Analys/**`.

## 3. Сказать Claude «Google включил»
Claude поставит `VITE_AUTH_GOOGLE: '1'` в `.github/workflows/pages.yml`, и после слияния кнопка появится на страницах входа и регистрации.

## Как проверить
Открыть https://d9zeen.github.io/CryptoJournal-Analys/login → «Продолжить с Google» → выбрать аккаунт.
Должен открыться дневник. Новый пользователь, как и при регистрации по почте, получает 7 дней Pro Plus.

## Когда будет свой домен
В Google (Authorized JavaScript origins) и в Supabase (Redirect URLs) добавить новый адрес сайта.
