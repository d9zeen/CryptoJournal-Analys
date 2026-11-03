# CryptoJournal

Онлайн-дневник сделок для криптотрейдеров: записываешь сделки и видишь статистику, которая помогает торговать лучше.

Стек: Vite + React + TypeScript + Tailwind CSS + Supabase, хостинг на Cloudflare Pages.
Решения, формулы и этапы описаны в [`docs/PLAN.md`](docs/PLAN.md).

---

## Что сделать руками

### Шаг 1. Supabase (~5 минут)

1. Зарегистрируйся на [supabase.com](https://supabase.com) и нажми **New project**.
2. Name: `cryptojournal`. **Region: Central EU (Frankfurt)**, ближе всего к СНГ.
3. Database password: придумай и сохрани у себя (в менеджере паролей). **Никому не отправляй, мне тоже.**
4. Когда проект создастся, открой **Project Settings → API Keys** (или **Settings → API**) и скопируй:
   - **Project URL**: `https://xxxx.supabase.co`;
   - **anon public** key (`eyJ...`) или **publishable** key (`sb_publishable_...`).

   Оба значения публичные: они всё равно видны в браузере, данные защищает база правилами RLS.
   ⚠️ Ключ `service_role` / `secret` **не копируй никуда**.

### Шаг 2. Настройки входа в Supabase

**Authentication → Sign In / Providers → Email:**
- на время разработки **выключи «Confirm email»**: так можно регистрироваться без письма. Встроенная почта Supabase шлёт письма только участникам твоей команды в Supabase, поэтому перед запуском подключим нормальный SMTP.

**Authentication → URL Configuration:**
- **Site URL**: адрес сайта на Cloudflare (появится в шаге 3), например `https://cryptojournal.pages.dev`;
- **Redirect URLs**: добавь
  - `http://localhost:5173/**`
  - `https://cryptojournal.pages.dev/**`
  - `https://*.cryptojournal.pages.dev/**` (превью-ссылки веток)

  Подставь своё имя проекта, если оно отличается.

### Шаг 3. Cloudflare Pages (автодеплой из GitHub)

1. Зарегистрируйся на [dash.cloudflare.com](https://dash.cloudflare.com).
2. **Workers & Pages → Create application → Pages → Connect to Git.** Если по умолчанию открывается мастер Workers, внизу будет ссылка *«Looking to deploy Pages? Get started»*.
3. Подключи GitHub и выбери репозиторий `CryptoJournal-Analys`.
4. Настройки сборки:
   - Framework preset: **React (Vite)** или None;
   - Build command: `npm run build`;
   - Build output directory: `dist`.
5. **Environment variables** (для Production и для Preview):
   - `VITE_SUPABASE_URL` = Project URL из шага 1;
   - `VITE_SUPABASE_ANON_KEY` = anon / publishable key из шага 1;
   - `NODE_VERSION` = `22`.
6. **Save and Deploy.** Через 1–2 минуты появится адрес `https://<проект>.pages.dev`.
7. Каждый пуш в любую ветку даёт превью-ссылку вида `https://<ветка>.<проект>.pages.dev`. Найти её можно во вкладке **Deployments**.

> Если поменял переменные окружения, нажми **Retry deployment**: переменные вшиваются в сайт при сборке.

### Шаг 4. Миграции базы (с этапа 2)

SQL-файлы лежат в `supabase/migrations/`. Применяй их **по порядку номеров**:
Supabase → **SQL Editor → New query** → вставь содержимое файла → **Run**.

---

## Запуск на своём компьютере (необязательно)

Нужен [Node.js 22+](https://nodejs.org).

```bash
npm install
cp .env.example .env    # и впиши в .env URL и ключ из шага 1
npm run dev             # откроется http://localhost:5173
```

## Безопасность

- Row Level Security на всех таблицах: каждый пользователь видит и меняет только свои данные.
- Во frontend только публичный ключ. Файл `.env` не попадает в git.
- Схема базы хранится в репозитории (`supabase/migrations`).
