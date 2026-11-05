-- =====================================================================
-- 0013 — Тарифы (оплаты пока нет — тариф выдаёт админ):
--   Basic (free)  — 30 сделок в месяц, импорт файлов, ручной ввод;
--   Pro           — 50 сделок в месяц + Polymarket;            ($10 / мес)
--   Pro Plus      — без лимита, API бирж, Polymarket, синхронизация на сервере каждые 3 часа. ($15 / мес)
-- Админ — всегда Pro Plus.
-- =====================================================================

create or replace function public.plan_trade_limit(p public.plan_type)
returns int
language sql
immutable
set search_path = ''
as $$
  select case p when 'free' then 30 when 'pro' then 50 else null end;
$$;
revoke execute on function public.plan_trade_limit(public.plan_type) from public, anon, authenticated;

create or replace function public.effective_plan(uid uuid)
returns public.plan_type
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.admins a where a.user_id = uid) then 'pro_plus'::public.plan_type
    when p.plan in ('pro', 'pro_plus') and (p.plan_until is null or p.plan_until > now()) then p.plan
    else 'free'::public.plan_type
  end
  from public.profiles p
  where p.id = uid;
$$;

-- Текст ошибки лимита — без слова Free (лимит есть и у Pro)
create or replace function public.enforce_trade_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m     date := (date_trunc('month', now() at time zone 'utc'))::date;
  used  int;
  lim   int := public.plan_trade_limit(coalesce(public.effective_plan(new.user_id), 'free'));
begin
  insert into public.usage_counters as uc (user_id, month, trades_created)
  values (new.user_id, m, 1)
  on conflict (user_id, month) do update set trades_created = uc.trades_created + 1
  returning uc.trades_created into used;

  if lim is not null and used > lim then
    raise exception 'FREE_LIMIT_REACHED'
      using errcode = 'P0001',
            detail  = format('Лимит тарифа: %s сделок в месяц', lim);
  end if;
  return new;
end;
$$;

-- Какой тариф нужен для подключения: Polymarket — Pro и выше, биржи (ключи API, кошельки DEX) — Pro Plus
create or replace function public.connection_plan_ok(p_exchange text, p_plan public.plan_type)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_exchange = 'polymarket' then p_plan in ('pro', 'pro_plus')
    else p_plan = 'pro_plus'
  end;
$$;
revoke execute on function public.connection_plan_ok(text, public.plan_type) from public, anon;
grant  execute on function public.connection_plan_ok(text, public.plan_type) to authenticated, service_role;

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
  if not public.connection_plan_ok(p_exchange, public.effective_plan(uid)) then
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
  if (select count(*) from public.exchange_connections where user_id = uid) >= 10 then
    raise exception 'TOO_MANY_CONNECTIONS' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.exchange_connections where user_id = uid and exchange = p_exchange and api_key = key) then
    raise exception 'CONNECTION_EXISTS' using errcode = '23505';
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

-- Синхронизация на сервере каждые 3 часа — только Pro Plus
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

-- Админка: Pro Plus тоже со сроком (или навсегда)
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
         plan_until = case when p_plan in ('pro', 'pro_plus') then p_until else null end
   where id = p_user;
  if not found then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;
revoke execute on function public.admin_set_plan(uuid, public.plan_type, timestamptz) from public, anon;
grant  execute on function public.admin_set_plan(uuid, public.plan_type, timestamptz) to authenticated;
