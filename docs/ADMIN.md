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

## Выдать Pro

На 30 дней:

```sql
update public.profiles
set plan = 'pro', plan_until = now() + interval '30 days'
where id = (select id from auth.users where email = 'user@example.com');
```

Бессрочно — `plan_until = null`. Продлить — ещё раз с новой датой.
Когда `plan_until` проходит, человек автоматически снова на Free (лимит 30 сделок в месяц).

## Снять Pro

```sql
update public.profiles
set plan = 'free', plan_until = null
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
