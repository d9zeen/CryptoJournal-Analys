# CryptoJournal

Онлайн-дневник сделок для криптотрейдеров: записываешь сделки и видишь статистику, которая помогает торговать лучше.

Стек: Vite + React + TypeScript + Tailwind CSS + Supabase.
Решения, формулы и этапы описаны в [`docs/PLAN.md`](docs/PLAN.md).

Порядок работы: **сначала всё на localhost**, потом хостинг, потом свой домен.

---

## Запуск на своём компьютере

### Быстрый способ на Windows

Если проект уже скачан (шаг 2) — дважды кликни **`start.bat`** в папке проекта. Он сам:

1. заберёт свежий код с GitHub (`git pull`);
2. установит зависимости (`npm install`);
3. при первом запуске создаст `.env` и откроет его в Блокноте — вставь туда ключи Supabase (шаг 3 ниже);
4. запустит сайт и откроет http://localhost:5173 в браузере.

Окно `start.bat` не закрывай, пока работаешь: закроешь — сайт остановится.

### Шаг 1. Установи программы (один раз)

- **Node.js 22 LTS**: [nodejs.org](https://nodejs.org) → кнопка LTS → установить.
  Проверка в терминале: `node -v` должно показать `v22...` или новее.
- **Git**: [git-scm.com](https://git-scm.com/downloads). На Mac он обычно уже есть.

### Шаг 2. Скачай проект

Открой терминал (Windows: PowerShell; Mac: Терминал) в папке, где хочешь хранить проект:

```bash
git clone https://github.com/d9zeen/CryptoJournal-Analys.git
cd CryptoJournal-Analys
git checkout claude/amazing-bohr-gt7ta9
npm install
```

Когда я добавлю новые изменения, забрать их так:

```bash
git pull
npm install
```

### Шаг 3. Supabase: база и вход (~5 минут, бесплатно)

Даже на localhost сайту нужна база. Она живёт в бесплатном облаке Supabase.

1. Зарегистрируйся на [supabase.com](https://supabase.com) и нажми **New project**.
2. Name: `cryptojournal`. **Region: Central EU (Frankfurt)**.
3. Database password: придумай и сохрани у себя. **Никому не отправляй, мне тоже.**
4. **Project Settings → API Keys** (или **Settings → API**): скопируй **Project URL** и **anon / publishable key**.
   ⚠️ Ключ `service_role` / `secret` **не копируй никуда**.
5. **Authentication → Sign In / Providers → Email**: выключи **Confirm email** на время разработки.
6. **Authentication → URL Configuration**:
   - Site URL: `http://localhost:5173`;
   - Redirect URLs: добавь `http://localhost:5173/**`.

### Шаг 4. Создай таблицы

Supabase → **SQL Editor → New query** → вставь **всё содержимое** файла
`supabase/migrations/0001_init.sql` → **Run**. Должно появиться «Success. No rows returned».

Новые миграции (`0002_...` и дальше) применяй так же, по порядку номеров. Каждую — один раз.

### Шаг 5. Впиши ключи и запусти

В папке проекта создай файл `.env`: скопируй `.env.example` и переименуй копию. Впиши в него значения из шага 3:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Запуск:

```bash
npm run dev
```

Открой в браузере **http://localhost:5173**. Остановить сервер: `Ctrl + C` в терминале.

> Поменял `.env` — останови сервер и запусти `npm run dev` заново.

---

## Полезные команды

| Команда | Что делает |
|---|---|
| `npm run dev` | запустить сайт на http://localhost:5173 |
| `npm test` | прогнать тесты формул (PnL, R и т.д.) |
| `npm run build` | проверить, что проект собирается без ошибок |
| `npm run test:db` | проверить базу и правила доступа (нужен локальный Postgres, необязательно) |

## Как выдать себе Pro (для проверки)

Supabase → **SQL Editor**:

```sql
update profiles set plan = 'pro', plan_until = null
where id = (select id from auth.users where email = 'твой@email');
```

Сам пользователь из браузера поменять тариф не может: это запрещено правилами базы.

## Безопасность

- Row Level Security на всех таблицах и в хранилище скриншотов: каждый видит и меняет только своё.
- Во frontend только публичный ключ. Файл `.env` не попадает в git.
- Лимит Free (30 сделок в месяц) проверяется и в интерфейсе, и в самой базе.
- Схема базы хранится в репозитории (`supabase/migrations`) и покрыта тестами (`supabase/tests`).

## Сайт в интернете: Cloudflare Pages (бесплатно)

Настраивается один раз. Дальше каждый `git push` в основную ветку сам обновляет сайт за 1–2 минуты.

1. Зарегистрируйся на [dash.cloudflare.com](https://dash.cloudflare.com/sign-up) (бесплатно).
2. **Workers & Pages → Create → вкладка Pages → Connect to Git.** Разреши доступ к GitHub и выбери репозиторий `d9zeen/CryptoJournal-Analys`.
3. Настройки сборки:
   | Поле | Значение |
   |---|---|
   | Production branch | `claude/amazing-bohr-gt7ta9` |
   | Framework preset | `React (Vite)` (или `None`) |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
4. **Environment variables** (там же, ниже) — добавь три переменные:
   | Имя | Значение |
   |---|---|
   | `VITE_SUPABASE_URL` | Project URL из Supabase |
   | `VITE_SUPABASE_ANON_KEY` | anon / publishable key из Supabase |
   | `NODE_VERSION` | `22` |
5. **Save and Deploy.** Через пару минут появится адрес вида `https://cryptojournal-analys.pages.dev`.
6. В Supabase: **Authentication → URL Configuration**
   - **Site URL** — адрес сайта из шага 5;
   - **Redirect URLs** — добавь `https://<твой-адрес>.pages.dev/**` и оставь `http://localhost:5173/**`.

   Без этого ссылки из писем (подтверждение, сброс пароля) будут вести на localhost.

Ключи Supabase поменял? Cloudflare → проект → Settings → Variables, затем Deployments → Retry deployment
(переменные `VITE_…` вшиваются в сайт при сборке).

Доступность из РФ (`*.pages.dev` иногда тормозит у российских провайдеров) проверим перед публичным запуском — план в `docs/PLAN.md`.
