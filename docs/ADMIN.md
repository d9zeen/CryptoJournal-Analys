# Администрирование (для владельца)

## Админка на сайте (с ноября 2026)

Страница **«Админка»** (иконка щита в левом меню, адрес `/admin`): все пользователи, их тариф,
сделки в этом месяце и всего; кнопки «Pro 30 дней», «Pro навсегда», «Снять Pro», «Сбросить лимит».
Пункт меню видят только админы. Доступ проверяет база (миграция `0005_admin.sql`): каждая функция
админки сначала проверяет, что ты в таблице `admins`, а если у тебя включена 2FA — что вход подтверждён кодом.

**Сделать человека админом** (только здесь, в SQL Editor — с сайта это невозможно):

```sql
insert into public.admins (user_id)
select id from auth.users where email = 'user@example.com'
on conflict do nothing;
```

Убрать из админов:

```sql
delete from public.admins
where user_id = (select id from auth.users where email = 'user@example.com');
```

Ниже — те же действия вручную через SQL (если сайт недоступен).

Всё делается в Supabase → **SQL Editor** → New query → вставить запрос → **Run**.
Проект: `cryptojournal` (https://supabase.com/dashboard/project/dkjavndvuulnzflowdhj).
Пользователь сам эти поля менять не может — защищено правами в базе.

## Админ — без лимитов

С миграций 0009 и 0013 админ (строка в таблице `admins`) всегда считается Pro Plus: без лимита сделок в месяц, с синхронизацией бирж каждые 3 часа,
без потолков на число сетапов / тегов / импортов / сделок. Выдавать себе Pro не нужно. Скриншотов — по-прежнему до 10 на сделку.

## Выдать / снять админку

На сайте: «Админка» → у пользователя «Сделать админом» (или «Снять админку» у админа). Себя снять нельзя — это делает другой админ;
последний админ всегда остаётся. Админ видит всех пользователей, выдаёт тарифы и админку и всегда работает на Pro Plus без лимитов (миграция 0014).

## Тарифы

Сетка (миграция 0016):
- Basic (free) — 50 сделок в месяц, подключений нет, 2 скриншота на сделку, 3 палитры;
- Pro ($10 / мес или $96 / год) — сделки без лимита, 1 подключение (Bybit или Hyperliquid, не Polymarket), синхронизация пока сайт открыт, 10 скриншотов, все палитры;
- Pro Plus ($15 / мес или $144 / год) — без лимита, до 5 подключений в любом сочетании (и Polymarket), сервер каждые 3 часа, 10 скриншотов.

Новый пользователь сам получает **пробный Pro Plus на 7 дней** (`plan_trial = true`); через 7 дней он сам становится Basic.

## Выдать тариф на срок

Проще всего — на сайте: «Админка» → «Какой тариф выдать» (Pro / Pro Plus) → у пользователя **«1 мес», «1 год» или «бессрочно»**.
Срок считается от сегодняшнего дня. Выдача тарифа снимает метку «пробный».

То же в SQL Editor — на месяц:

```sql
select public.admin_set_plan((select id from auth.users where email = 'user@example.com'), 'pro', now() + interval '1 month');
```

На год — `interval '1 year'`, бессрочно — `null`; Pro Plus — `'pro_plus'`. (`admin_set_plan` в SQL Editor работает, только если ты есть в `admins`;
иначе — напрямую: `update public.profiles set plan = 'pro', plan_until = now() + interval '1 year', plan_trial = false where id = (...)`.)
Продлить — ещё раз с новой датой. Когда `plan_until` проходит, человек автоматически снова на Basic (50 сделок в месяц);
его подключения не удаляются, а встают на паузу.

## Снять Pro

```sql
update public.profiles
set plan = 'free', plan_until = null, plan_trial = false
where id = (select id from auth.users where email = 'user@example.com');
```

## Посмотреть пользователей и тарифы

```sql
select u.email, p.plan, p.plan_until, u.created_at,
       (select count(*) from public.trades t where t.user_id = u.id) as trades
from auth.users u join public.profiles p on p.id = u.id
order by u.created_at desc;
```

## Сбросить лимит Free в этом месяце (например, после ошибочного импорта)

```sql
update public.usage_counters
set trades_created = 0
where month = date_trunc('month', now() at time zone 'utc')::date
  and user_id = (select id from auth.users where email = 'user@example.com');
```


## Синхронизация по расписанию (Pro, каждые 3 часа)

Задание в расписании:
```sql
select jobname, schedule, active from cron.job;
```

Последние запуски и ответы функции sync-worker:
```sql
select start_time, status, return_message from cron.job_run_details order by start_time desc limit 10;
select created, status_code, left(content::text, 200) from net._http_response order by created desc limit 20;
```

Состояние подключений (когда обновлялись, ошибки, срок ключа):
```sql
select u.email, c.exchange, c.label, c.last_sync_at, c.last_error, c.key_expires_at
from exchange_connections c join auth.users u on u.id = c.user_id
order by c.last_sync_at desc nulls last;
```

Запустить рассылку прямо сейчас (не дожидаясь расписания):
```sql
select public.dispatch_sync();
```

Остановить / снова включить расписание:
```sql
select cron.alter_job((select jobid from cron.job where jobname = 'cj-sync'), active := false);
select cron.alter_job((select jobid from cron.job where jobname = 'cj-sync'), active := true);
```
