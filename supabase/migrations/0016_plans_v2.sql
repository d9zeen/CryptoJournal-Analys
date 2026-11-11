-- =====================================================================
-- 0016 — Новая сетка тарифов (ноябрь 2026) и пробный период.
--   Basic (free) — 50 сделок в месяц, подключений 0, скриншотов 2 на сделку;
--   Pro          — сделки без лимита, 1 подключение (биржа или кошелёк: Bybit, Hyperliquid — НЕ Polymarket),
--                  синхронизация только при открытом сайте, скриншотов 10;
--   Pro Plus     — сделки без лимита, до 5 подключений в любом сочетании (и Polymarket),
--                  синхронизация на сервере каждые 3 часа, скриншотов 10.
-- Новый пользователь — 7 дней Pro Plus (plan_until), потом effective_plan сам вернёт Basic.
-- Админ — всегда Pro Plus и без лимита подключений.
-- Уже существующие подключения не удаляются: лишние (сверх тарифа) просто не синхронизируются — connection_active.
--
-- Как применить: Supabase → SQL Editor → New query → вставить весь файл → Run. Один раз.
-- =====================================================================

-- Сделок в месяц
create or replace function public.plan_trade_limit(p public.plan_type)
returns int
language sql
immutable
set search_path = ''
as $$
  select case p when 'free' then 50 else null end;
$$;
revoke execute on function public.plan_trade_limit(public.plan_type) from public, anon, authenticated;

-- Сколько подключений можно (бирж и кошельков вместе)
create or replace function public.plan_connection_limit(p public.plan_type)
returns int
language sql
immutable
set search_path = ''
as $$
  select case p when 'pro' then 1 when 'pro_plus' then 5 else 0 end;
$$;
revoke execute on function public.plan_connection_limit(public.plan_type) from public, anon;
grant  execute on function public.plan_connection_limit(public.plan_type) to authenticated, service_role;

-- Скриншотов на сделку
create or replace function public.plan_screenshot_limit(p public.plan_type)
returns int
language sql
immutable
set search_path = ''
as $$
  select case p when 'free' then 2 else 10 end;
$$;
revoke execute on function public.plan_screenshot_limit(public.plan_type) from public, anon;
grant  execute on function public.plan_screenshot_limit(public.plan_type) to authenticated, service_role;

-- Какой тариф нужен для подключения: Polymarket — только Pro Plus, биржи и кошельки — Pro и Pro Plus
create or replace function public.connection_plan_ok(p_exchange text, p_plan public.plan_type)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_exchange = 'polymarket' then p_plan = 'pro_plus'
    else p_plan in ('pro', 'pro_plus')
  end;
$$;
revoke execute on function public.connection_plan_ok(text, public.plan_type) from public, anon;
grant  execute on function public.connection_plan_ok(text, public.plan_type) to authenticated, service_role;

-- Работает ли подключение по текущему тарифу владельца: тип разрешён и оно среди первых N (по дате подключения).
-- connection_ok — для базы (dispatch_sync), снаружи не вызывается.
-- security definer: нужен тариф владельца (effective_plan закрыт для браузера) и все его подключения.
create or replace function public.connection_ok(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with u as (
    select ec.id, ec.user_id, ec.exchange, ec.created_at,
           public.effective_plan(ec.user_id) as plan,
           exists (select 1 from public.admins a where a.user_id = ec.user_id) as is_admin
      from public.exchange_connections ec
     where ec.id = p_id
  )
  select coalesce((
    select case
      when u.is_admin then true
      when not public.connection_plan_ok(u.exchange, u.plan) then false
      else (
        select count(*)
          from public.exchange_connections o
         where o.user_id = u.user_id
           and public.connection_plan_ok(o.exchange, u.plan)
           and (o.created_at, o.id) < (u.created_at, u.id)
      ) < public.plan_connection_limit(u.plan)
    end
    from u
  ), false);
$$;
revoke execute on function public.connection_ok(uuid) from public, anon, authenticated;

-- То же для браузера (только свои подключения) и для sync-worker (service_role, без пользователя — любые); анониму закрыто
create or replace function public.connection_active(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is not null and not exists (
      select 1 from public.exchange_connections ec where ec.id = p_id and ec.user_id = auth.uid()
    ) then false
    else public.connection_ok(p_id)
  end;
$$;
revoke execute on function public.connection_active(uuid) from public, anon;
grant  execute on function public.connection_active(uuid) to authenticated, service_role;

create or replace function public.add_exchange_connection(p_exchange text, p_api_key text, p_secret text default null, p_label text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid  uuid := auth.uid();
  kind text := public.connection_kind(p_exchange);
  key  text := btrim(coalesce(p_api_key, ''));
  plan public.plan_type;
  admin boolean;
  sid  uuid;
  new_id uuid;
begin
  if uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.mfa_ok() then
    raise exception 'MFA_REQUIRED' using errcode = '42501';
  end if;
  if kind is null then
    raise exception 'EXCHANGE_NOT_SUPPORTED' using errcode = '22023';
  end if;
  plan  := coalesce(public.effective_plan(uid), 'free');
  admin := exists (select 1 from public.admins a where a.user_id = uid);
  if not public.connection_plan_ok(p_exchange, plan) then
    raise exception 'PLAN_REQUIRED' using errcode = '42501';
  end if;
  if kind = 'wallet' then
    if key !~ '^0x[0-9a-fA-F]{40}$' then
      raise exception 'BAD_WALLET' using errcode = '22023';
    end if;
    key := lower(key);
  else
    if key !~ '^[A-Za-z0-9]{8,64}$' or coalesce(char_length(p_secret), 0) not between 8 and 128 then
      raise exception 'BAD_API_KEY' using errcode = '22023';
    end if;
  end if;
  if exists (select 1 from public.exchange_connections where user_id = uid and exchange = p_exchange and api_key = key) then
    raise exception 'CONNECTION_EXISTS' using errcode = '23505';
  end if;
  -- лимит тарифа (все подключения, в том числе «на паузе»); у админа — только технический потолок 10
  if not admin and (select count(*) from public.exchange_connections where user_id = uid) >= public.plan_connection_limit(plan) then
    raise exception 'CONNECTION_LIMIT_REACHED'
      using errcode = 'P0001',
            detail  = format('Лимит тарифа: %s подключений', public.plan_connection_limit(plan));
  end if;
  if (select count(*) from public.exchange_connections where user_id = uid) >= 10 then
    raise exception 'TOO_MANY_CONNECTIONS' using errcode = 'P0001';
  end if;

  if kind = 'cex' then
    sid := vault.create_secret(p_secret, 'cj_' || gen_random_uuid()::text, 'CryptoJournal: ключ API ' || p_exchange);
  end if;

  insert into public.exchange_connections (user_id, exchange, label, api_key, secret_id)
  values (uid, p_exchange, nullif(btrim(coalesce(p_label, '')), ''), key, sid)
  returning id into new_id;
  return new_id;
end;
$$;
revoke execute on function public.add_exchange_connection(text, text, text, text) from public, anon;
grant  execute on function public.add_exchange_connection(text, text, text, text) to authenticated;

-- Синхронизация на сервере каждые 3 часа — только Pro Plus и только подключения в пределах тарифа
create or replace function public.dispatch_sync()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  base   text;
  secret text;
  c      record;
  n      int := 0;
begin
  select decrypted_secret into base from vault.decrypted_secrets where name = 'cj_project_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'cj_sync_secret';
  if base is null or secret is null then
    raise notice 'dispatch_sync: нет cj_project_url или cj_sync_secret в Vault';
    return 0;
  end if;
  for c in
    select ec.id
      from public.exchange_connections ec
     where public.effective_plan(ec.user_id) = 'pro_plus'
       and public.connection_ok(ec.id)
       and (ec.last_error is null or ec.last_error not like 'KEY\_%')
       and (ec.last_sync_at is null or ec.last_sync_at < now() - interval '170 minutes')
     order by ec.last_sync_at nulls first
     limit 1000
  loop
    perform net.http_post(
      url := rtrim(base, '/') || '/functions/v1/sync-worker',
      body := jsonb_build_object('connectionId', c.id),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-secret', secret, 'x-region', 'eu-central-1'),
      timeout_milliseconds := 120000
    );
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function public.dispatch_sync() from public, anon, authenticated;

-- Скриншоты: Basic — 2 на сделку, Pro и Pro Plus — 10.
-- security definer: нужен тариф владельца сделки (effective_plan закрыт для браузера)
create or replace function public.enforce_screenshot_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  lim int := public.plan_screenshot_limit(coalesce(public.effective_plan(new.user_id), 'free'));
begin
  -- считаем только свои строки: о чужой сделке триггер ничего не сообщает (её отклонят RLS / внешний ключ)
  if (select count(*) from public.trade_screenshots where trade_id = new.trade_id and user_id = new.user_id) >= lim then
    raise exception 'SCREENSHOT_LIMIT_REACHED'
      using errcode = 'P0001',
            detail  = format('Лимит тарифа: %s скриншотов на сделку', lim);
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_screenshot_limit() from public, anon, authenticated;

-- Пробный ли тариф (Pro Plus на 7 дней при регистрации). Читать можно (select на profiles), менять из браузера — нет (нет grant update)
alter table public.profiles add column if not exists plan_trial boolean not null default false;

-- Пробный период: новый пользователь — 7 дней Pro Plus
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text := new.raw_user_meta_data ->> 'timezone';
begin
  insert into public.profiles (id, timezone, plan, plan_until, plan_trial)
  values (new.id, case when tz is not null and public.is_valid_timezone(tz) then tz else 'UTC' end,
          'pro_plus', now() + interval '7 days', true);

  insert into public.setups (user_id, name, sort_order)
  select new.id, x.name, x.ord
  from unnest(array[
    'Пробой уровня', 'Отбой от уровня', 'Ретест', 'По тренду', 'Контртренд', 'Новости'
  ]) with ordinality as x(name, ord);

  insert into public.mistake_tags (user_id, name, sort_order)
  select new.id, x.name, x.ord
  from unnest(array[
    'FOMO', 'Ранний вход', 'Поздний вход', 'Двинул стоп', 'Без стопа',
    'Превысил риск', 'Ранний выход', 'Отыгрыш', 'Овертрейдинг', 'Не по плану'
  ]) with ordinality as x(name, ord);

  insert into public.emotions (user_id, name, sort_order)
  select new.id, x.name, x.ord
  from unnest(array[
    'Спокоен', 'Уверен', 'Сомнение', 'Страх', 'Жадность', 'Азарт', 'Скука', 'Тильт'
  ]) with ordinality as x(name, ord);

  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Админ выдал тариф — это уже не пробный период
create or replace function public.admin_set_plan(p_user uuid, p_plan public.plan_type, p_until timestamptz default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  update public.profiles
     set plan = p_plan,
         plan_until = case when p_plan in ('pro', 'pro_plus') then p_until else null end,
         plan_trial = false
   where id = p_user;
  if not found then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;
revoke execute on function public.admin_set_plan(uuid, public.plan_type, timestamptz) from public, anon;
grant  execute on function public.admin_set_plan(uuid, public.plan_type, timestamptz) to authenticated;

-- Админка: в списке пользователей видно пробный период (plan_trial). Тип результата меняется — функцию пересоздаём.
drop function if exists public.admin_list_users();
create function public.admin_list_users()
returns table (
  id              uuid,
  email           text,
  created_at      timestamptz,
  last_sign_in_at timestamptz,
  plan            public.plan_type,
  plan_until      timestamptz,
  plan_trial      boolean,
  effective_plan  public.plan_type,
  trades_month    int,
  trades_total    bigint,
  is_admin        boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  return query
    select u.id,
           u.email::text,
           u.created_at,
           u.last_sign_in_at,
           p.plan,
           p.plan_until,
           p.plan_trial,
           public.effective_plan(u.id),
           coalesce(uc.trades_created, 0),
           (select count(*) from public.trades t where t.user_id = u.id),
           exists (select 1 from public.admins a where a.user_id = u.id)
    from auth.users u
    join public.profiles p on p.id = u.id
    left join public.usage_counters uc
      on uc.user_id = u.id and uc.month = (date_trunc('month', now() at time zone 'utc'))::date
    order by u.created_at desc;
end;
$$;
revoke execute on function public.admin_list_users() from public, anon;
grant  execute on function public.admin_list_users() to authenticated;
