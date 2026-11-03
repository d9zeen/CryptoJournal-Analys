# Администрирование (для владельца)

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
