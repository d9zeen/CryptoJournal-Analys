-- =====================================================================
-- 0007 — Синхронизация бирж на сервере по расписанию (как TradeZella: каждые 3 часа), только тариф Pro.
--
--  pg_cron (каждые 3 ч) → public.dispatch_sync() → для каждого подключения Pro, которому пора,
--  pg_net шлёт запрос серверной функции sync-worker с секретом из Vault в заголовке x-sync-secret.
--  sync-worker проверяет секрет (sync_secret_ok), качает сделки и пишет их от имени владельца.
--
--  Настройка окружения (один раз, SQL Editor) — адрес проекта в Vault:
--    select vault.create_secret('https://<ref>.supabase.co', 'cj_project_url', 'CryptoJournal: адрес проекта для sync-worker');
--  Секрет вызова создаётся этой миграцией сам (cj_sync_secret).
-- =====================================================================

-- Расширения (на Supabase есть; в локальных тестах — заглушки)
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
  end if;
end $$;


-- Когда истекает ключ (Bybit отключает ключи без привязки к IP через 90 дней) — чтобы предупредить заранее
alter table public.exchange_connections add column key_expires_at timestamptz;
grant select (key_expires_at) on public.exchange_connections to authenticated;

create or replace function public.set_connection_key_expiry(p_id uuid, p_expires timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.mfa_ok() then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  update public.exchange_connections set key_expires_at = p_expires
   where id = p_id and user_id = auth.uid();
end;
$$;
revoke execute on function public.set_connection_key_expiry(uuid, timestamptz) from public, anon;
grant  execute on function public.set_connection_key_expiry(uuid, timestamptz) to authenticated;


-- Секрет, которым база подписывает вызовы sync-worker (случайный, создаётся один раз)
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cj_sync_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      'cj_sync_secret',
      'CryptoJournal: секрет вызова sync-worker по расписанию'
    );
  end if;
end $$;

-- sync-worker проверяет, что его вызвала база (только service_role)
create or replace function public.sync_secret_ok(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_secret, '') <> '' and exists (
    select 1 from vault.decrypted_secrets where name = 'cj_sync_secret' and decrypted_secret = p_secret
  );
$$;
revoke execute on function public.sync_secret_ok(text) from public, anon, authenticated;
grant  execute on function public.sync_secret_ok(text) to service_role;

-- sync-worker проверяет тариф владельца подключения
grant execute on function public.effective_plan(uuid) to service_role;


-- Разослать задания: подключения Pro, которые давно не синхронизировались и не сломаны (ключ отозван / истёк)
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
     where public.effective_plan(ec.user_id) = 'pro'
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


-- Расписание: каждые 3 часа (в 7 минут, чтобы не толкаться с чужими задачами в :00)
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('cj-sync', '7 */3 * * *', 'select public.dispatch_sync()');
  end if;
end $$;
