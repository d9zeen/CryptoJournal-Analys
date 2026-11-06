# CryptoJournal — контекст для Claude

Онлайн-дневник сделок для русскоязычных криптотрейдеров (фьючерсы Bybit / BingX / OKX + спот):
запись сделок, статистика, импорт CSV. Тарифы Basic (free) / Pro / Pro Plus — `src/lib/plans.ts` + база (0013); оплаты пока нет, тариф выдаёт админ.

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
  styles/theme.css     ВСЕ цвета, шрифты и анимации (Tailwind @theme), стиль «Аврора». Классы: bg-bg, bg-surface, bg-surface-2,
                       border-border, text-text, text-muted, text-primary (фиолет: кнопки), text-accent (мята: данные),
                       text-profit, text-loss, font-display (заголовки), num (цифры моно), rise (появление, --i), card-lift.
                       Без свечений, пульсаций и градиентов — сайт не должен выглядеть «сгенерированным». Светлая тема — :root[data-theme='light'] в том же файле
  lib/theme.ts         тёмная / светлая тема (localStorage, ставится до отрисовки в main.tsx), useTheme / setTheme
  lib/motion.ts        prefersReducedMotion, useCountUp — анимации уважают «уменьшить движение»
  i18n/ru.ts           ВСЕ тексты интерфейса. Новый язык = файл с той же структурой (тип Dict)
  i18n/index.ts        useT(), fmt(), plural() — числа со словом («1 сделка / 2 сделки / 5 сделок»)
  lib/supabase.ts      клиент Supabase (только публичный ключ)
  lib/calc/            формулы PnL / R (trade.ts), статистика дашборда (stats.ts), оценка трейдера 0…100 (score.ts) + тесты
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
  layout/AppLayout.tsx левая панель: на широком экране (lg) — логотип, пункты с подписями, внизу карточка тарифа с лимитом, тема, выход;
                       на планшете — только иконки (подпись при наведении) + шапка; на телефоне — шапка и нижнее меню с подписями
  lib/sync/            подключения бирж по API: run.ts (общий движок), bybit.ts (closed-pnl), hyperliquid.ts (исполнения кошелька),
                       polymarket.ts (закрытые позиции по адресу; рынок prediction: цена исхода 0…1, проигрыш — выход 0, название — trades.title) + тесты
  features/calendar/   вкладка «Календарь» (/calendar): тепловая карта месяца (плюс — фиолетовый, минус — серый, яркость по сумме дня) + панель итогов
                       (monthSummary в lib/calc/calendar.ts: дни в плюс / минус, лучший / худший день, недели, дни недели)
  features/landing/    главная для гостей «/» (вошедшего — в дашборд): живое демо на тех же виджетах (demo.ts), возможности, тарифы (PlansTable), вопросы
  features/<раздел>/   auth, dashboard, admin, connections (подключённые биржи, автосинхронизация) (админка: пользователи, Pro, сброс лимита), analysis (вкладка «Разбор»: таблицы по сетапам, ошибкам, парам, эмоциям, Long/Short), trades, import, settings
                       dashboard (в духе TradeZella): Widgets.tsx (ряд показателей со шкалами на SVG, «Оценка трейдера», «Ключевые цифры» — три мини-панели: разброс сделок, просадка, R), всё в тон кривой: фиолетовый + приглушённый серый,
                       charts.tsx (Recharts, лениво: кривая капитала, PnL по дням, радар оценки); страница «Статистика» (пункт меню тоже «Статистика»); кривая капитала — одна фиолетовая линия (primary) с мягкой заливкой, ось X по номеру сделки (выбор владельца),
                       EquityTableDialog (таблица сделок в <dialog>), equityTime.ts (время точек, $ / %)
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
6. **Вёрстка** — mobile-first, проверять на ширине 390px **и на широком мониторе (1920px)**: контейнер до 2200px, прижат к левой панели (без пустой полосы слева), на xl блоки раскладываются в колонки рядом (владелец не любит узкую ленту по центру и длинную прокрутку).
7. После каждого этапа: краткий отчёт «что сделано / как проверить», коммит с понятным сообщением, обновить статус этапов в `docs/PLAN.md`.

## Переменные окружения

| Имя | Что это |
|---|---|
| `VITE_SUPABASE_URL` | Project URL из Supabase |
| `VITE_SUPABASE_ANON_KEY` | anon key или publishable key (публичный) |
| `BASE_PATH` | только при сборке для GitHub Pages: `/CryptoJournal-Analys/` (ставит workflow) |

Проект Supabase: `cryptojournal`, ref `dkjavndvuulnzflowdhj` (Frankfurt), миграции 0001–0014 применены (0005 — админка, владелец добавлен в `admins`; 0006 — подключения бирж; 0007–0008 — синхронизация по расписанию; 0009 — админ без лимитов; 0010–0011 — Polymarket, рынок `prediction`, `trades.title`; 0012–0013 — тарифы Pro / Pro Plus; 0014 — выдача админки на сайте, 05.11.2026).
Подключения бирж (как TradeZella): `features/connections` + `lib/sync` + серверная функция `supabase/functions/exchange-proxy` (выложена; при изменении — выложить заново через коннектор Supabase, verify_jwt = true). Секреты ключей — в Vault, браузер их не видит. Новые биржи: `connection_kind` в новой миграции + модуль в `lib/sync` + `CONNECTABLE`.
Синхронизация по расписанию (Pro Plus, каждые 3 ч): pg_cron `cj-sync` → `dispatch_sync()` → pg_net → функция `sync-worker` (verify_jwt = false, проверяет секрет `cj_sync_secret` из Vault).
Логика одна для браузера и сервера: `src/lib/sync/run.ts`; `supabase/functions/sync-worker/engine.js` собирается `npm run build:functions` (CI проверяет, что он свежий).
Выкладка sync-worker: в index.ts импорт `./engine.js` заменить на `https://cdn.jsdelivr.net/gh/d9zeen/CryptoJournal-Analys@<SHA коммита>/supabase/functions/sync-worker/engine.js` (коммит уже запушен) и выложить через коннектор Supabase.
Тарифы: Basic — 30 сделок/мес; Pro ($10) — 50 сделок/мес + Polymarket; Pro Plus ($15) — без лимита, биржи по API, Polymarket, сервер каждые 3 ч.
Проверки тарифа — в базе (`plan_trade_limit`, `connection_plan_ok`, `dispatch_sync`), в exchange-proxy / sync-worker и в интерфейсе (`canConnect`). Страница `/plans`.
Админка: `/admin` (features/admin); админ всегда Pro Plus и без потолков записей (`effective_plan`, 0009); таблица `admins` + функции `is_admin`, `admin_list_users`, `admin_set_plan`, `admin_reset_usage`; админку выдаёт / снимает админ на сайте (`admin_set_admin`; себя и последнего админа снять нельзя) или SQL Editor (docs/ADMIN.md).
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

Сайт уже выкладывается на GitHub Pages: проверка изменений — на https://d9zeen.github.io/CryptoJournal-Analys/ после слияния PR
(владелец localhost не использует; в отчёте «как проверить» — ссылка на сайт). Домен — позже (этап 5).
Данные: TanStack Query, ключи `['trades', ...]`, `['trade', id]`, `['list', kind]`, `['profile']`, `['usage']`.
Ошибка лимита из БД приходит как `FREE_LIMIT_REACHED` → `lib/errors.ts`.

**Скорость (проверено на 5000 сделок, e2e/perf.spec.ts):**
- Supabase отдаёт не больше 1000 строк за запрос — списки грузить только через `fetchTradesPaged` (пачки по 1000), никогда `.limit(N)` одним запросом.
- Длинные списки рисовать порциями (`PAGE = 100` + «Показать ещё»), только одну раскладку (таблица ИЛИ карточки, `useMediaQuery`), не обе со скрытием.
- Графики: не больше нескольких сотен точек — `downsampleEquity`, `pnlBars` (дни → недели → месяцы).

Основная ветка: `claude/amazing-bohr-gt7ta9`. Новые этапы приходят в неё через Pull Request.
Страницы приложения грузятся лениво (`lazyPage` в `App.tsx`), графики (`features/dashboard/charts.tsx`) — тоже: Recharts — отдельный файл сборки.
Цвета в графиках — `var(--color-…)` из theme.css.
Шрифты — npm `@fontsource-variable/*` (файлы в сборке); `assetsInlineLimit` в vite.config.ts не даёт встраивать их как data: (CSP).
Новые цвета — в ОБЕ темы theme.css (тёмная в @theme, светлая в :root[data-theme='light']).
