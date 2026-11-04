# CryptoJournal — контекст для Claude

Онлайн-дневник сделок для русскоязычных криптотрейдеров (фьючерсы Bybit / BingX / OKX + спот):
запись сделок, статистика, импорт CSV. Подписка Free / Pro (оплаты в MVP нет, только поле `plan` и лимиты).

Владелец — не профессиональный разработчик: объяснять простым языком, маленькие шаги,
после каждого шага — как проверить результат. Общение на русском.

**Все договорённости и формулы — в `docs/PLAN.md`. Читать перед работой.**

## Стек

- Vite + React 19 + TypeScript + Tailwind CSS v4 — статический SPA
- React Router (`createBrowserRouter`, импорт из `react-router`)
- Supabase: Postgres, Auth (email + пароль), Storage — без своего сервера
- Recharts — графики (этап 3)
- Хостинг: GitHub Pages (`.github/workflows/pages.yml`, адрес https://d9zeen.github.io/CryptoJournal-Analys/), автодеплой при push в основную ветку.
  Сайт в подпапке: `BASE_PATH` при сборке → `src/lib/url.ts` (`BASENAME`, `appUrl`). Абсолютные пути `/…` в коде не писать —
  ссылки только через роутер, адреса для писем — через `appUrl()`. `404.html` создаёт сборка (SPA-фолбэк), в репо его нет

## Команды

```bash
npm install        # зависимости
npm run dev        # локальный сервер http://localhost:5173
npm run build      # проверка типов + сборка в dist/
npm run typecheck  # только проверка типов
npm test           # тесты формул и логики (Vitest)
npm run test:db    # миграции + тесты RLS на локальном Postgres (нужен psql; PGPASSWORD при необходимости)
npm run test:e2e   # сквозные тесты в браузере (Playwright): боевая сборка + фейковый Supabase (e2e/fixtures.ts)
```

Node 22 (см. `.node-version`).

## Структура

```
src/
  styles/theme.css     ВСЕ цвета и шрифты (Tailwind @theme). Классы: bg-bg, bg-surface, bg-surface-2,
                       border-border, text-text, text-muted, text-primary, text-profit, text-loss
  i18n/ru.ts           ВСЕ тексты интерфейса. Новый язык = файл с той же структурой (тип Dict)
  i18n/index.ts        useT(), fmt()
  lib/supabase.ts      клиент Supabase (только публичный ключ)
  lib/calc/            формулы PnL / R (trade.ts), статистика дашборда (stats.ts) + тесты
  lib/tz.ts            дата / час / день недели в часовом поясе пользователя
  lib/format.ts        форматирование $, цен, R, дат
  lib/parse.ts         ввод чисел (понимает запятую)
  lib/period.ts        пресеты периода (неделя/месяц/всё/свой)
  lib/queryClient.ts   TanStack Query — кэш запросов к Supabase
  types/db.ts          типы строк БД (писать руками при изменении схемы)
  lib/import/          импорт с любой биржи: csv.ts / xlsx.ts (чтение файла), fields.ts (колонки-синонимы, направление, комиссии),
                       universal.ts (движок) → positions.ts (закрытые позиции) | fills.ts (история исполнений → сделки),
                       pnl.ts, plan.ts (новые/дубли/лимит), registry.ts (список бирж) + тесты
  lib/export/          выгрузка сделок в CSV (+ тесты); features/settings/dataApi.ts — выгрузка и удаление аккаунта
  components/ui/       базовые компоненты (Button, Input, Card, Alert, Spinner)
  layout/AppLayout.tsx шапка + нижнее меню на телефоне
  features/<раздел>/   auth, dashboard, trades, import, settings
supabase/migrations/   SQL-миграции, нумерация 0001_..., 0002_...
supabase/tests/        заглушка Supabase для чистого Postgres + тесты RLS (rls_test.sql);
                       live_check.sql — проверка защиты на НАСТОЯЩЕЙ базе (всё откатывает)
e2e/                   сквозные тесты: вход, 2FA, дашборд, форма сделки, импорт, настройки, iframe; без ошибок JS и CSP
.github/workflows/     pages.yml — выкладка сайта; ci.yml — все тесты на каждое изменение (Postgres в CI для RLS)
docs/PLAN.md           решения, формулы, схема БД, этапы
docs/ADMIN.md          SQL для владельца: выдать/снять Pro, список пользователей, сброс лимита
docs/SECURITY.md       вся защита (база, сайт, сборка) + что владелец включает руками
```

## Правила

1. **Тексты** — только через `useT()` и `src/i18n/ru.ts`. Никаких строк на русском прямо в JSX.
2. **Цвета/шрифты** — только токены из `theme.css`. Никаких `#hex` и `text-green-500` в компонентах.
3. **Безопасность:**
   - RLS включён на КАЖДОЙ таблице, политика `user_id = auth.uid()`; Storage — по папке `{user_id}/`.
   - Во frontend только anon / publishable key. `service_role` / secret key — никогда.
   - `.env` в `.gitignore`, в репо только `.env.example`.
   - Поле `profiles.plan` пользователь менять не может (защита в БД).
   - Лимиты проверяются и на клиенте, и триггером в БД.
   - **2FA в базе:** на каждой таблице есть restrictive-политика `*_mfa` (`mfa_ok()`); новой таблице — тоже добавить. Новые функции: `security definer` только при необходимости, `set search_path = ''`, `revoke … from public, anon`.
   - CSP в `vite.config.ts`: новый внешний адрес (API, картинки) — добавить туда, иначе браузер его заблокирует. Никаких внешних скриптов / CDN.
4. **Миграции** — каждое изменение схемы новым SQL-файлом в `supabase/migrations/`, старые не редактировать после применения. Владелец применяет их через Supabase → SQL Editor. Любое изменение схемы/RLS — дописать проверку в `supabase/tests/rls_test.sql` и прогнать `npm run test:db`.
5. **Деньги** — формулы в `src/lib/calc/`, покрыты тестами (Vitest). Время хранится в UTC (`timestamptz`).
6. **Вёрстка** — mobile-first, проверять на ширине 390px **и на широком мониторе (1920px)**: контейнер до 1800px, на xl блоки раскладываются в колонки рядом (владелец не любит узкую ленту по центру и длинную прокрутку).
7. После каждого этапа: краткий отчёт «что сделано / как проверить», коммит с понятным сообщением, обновить статус этапов в `docs/PLAN.md`.

## Переменные окружения

| Имя | Что это |
|---|---|
| `VITE_SUPABASE_URL` | Project URL из Supabase |
| `VITE_SUPABASE_ANON_KEY` | anon key или publishable key (публичный) |
| `BASE_PATH` | только при сборке для GitHub Pages: `/CryptoJournal-Analys/` (ставит workflow) |

Проект Supabase: `cryptojournal`, ref `dkjavndvuulnzflowdhj` (Frankfurt), миграции 0001–0004 применены.
Скриншоты: таблица `trade_screenshots` (до 10 на сделку), файлы `{user_id}/{trade_id}/{uuid}.webp`; старое поле `trades.screenshot_path` не используется.
Публичные URL и publishable key вписаны в `.env.example` и `.github/workflows/pages.yml` (секреты репозитория НЕ используются — старый секрет однажды перебил адрес).
Новые миграции владелец применяет в SQL Editor (или Claude через коннектор Supabase, если он подключён).

Без них приложение показывает экран «Supabase ещё не подключён» вместо белого экрана.

## Статус

- [x] Этап 0 — документация
- [x] Этап 1 — каркас, роутинг, auth
- [x] Этап 2 — сделки + RLS
- [x] Этап 3 — дашборд
- [x] Этап 4 — импорт Bybit CSV (сверить с реальным файлом Bybit)
- [ ] Этап 5 — лимиты, полировка, деплой

Разработка сейчас идёт на localhost (`npm run dev`), деплой и домен — позже (этап 5).
Данные: TanStack Query, ключи `['trades', ...]`, `['trade', id]`, `['list', kind]`, `['profile']`, `['usage']`.
Ошибка лимита из БД приходит как `FREE_LIMIT_REACHED` → `lib/errors.ts`.

**Скорость (проверено на 5000 сделок, e2e/perf.spec.ts):**
- Supabase отдаёт не больше 1000 строк за запрос — списки грузить только через `fetchTradesPaged` (пачки по 1000), никогда `.limit(N)` одним запросом.
- Длинные списки рисовать порциями (`PAGE = 100` + «Показать ещё»), только одну раскладку (таблица ИЛИ карточки, `useMediaQuery`), не обе со скрытием.
- Графики: не больше нескольких сотен точек — `downsampleEquity`, `pnlBars` (дни → недели → месяцы).

Основная ветка: `claude/amazing-bohr-gt7ta9`. Новые этапы приходят в неё через Pull Request.
Страницы приложения грузятся лениво (`lazyPage` в `App.tsx`), графики (`features/dashboard/charts.tsx`) — тоже: Recharts — отдельный файл сборки.
Цвета в графиках — `var(--color-…)` из theme.css.
