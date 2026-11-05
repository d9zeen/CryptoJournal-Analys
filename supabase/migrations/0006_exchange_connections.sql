-- =====================================================================
-- 0006 — Подключения бирж (как у TradeZella): сделки подтягиваются сами.
--
--  * CEX (Bybit…): ключ API «только чтение». Секрет хранится зашифрованным в Supabase Vault,
--    из браузера его прочитать нельзя — только серверная функция exchange-proxy (service_role).
--  * DEX (Hyperliquid…): только публичный адрес кошелька, секретов нет.
--
-- Строки меняются только функциями ниже (прямых прав на insert / update / delete нет).
-- =====================================================================

alter type public.trade_source add value if not exists 'api';

create table public.exchange_connections (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  exchange      text not null check (exchange ~ '^[a-z0-9_]{2,20}$'),
  label         text check (char_length(label) <= 60),
  api_key       text not null check (char_length(api_key) between 4 and 200),  -- публичный ключ или адрес кошелька
  secret_id     uuid,                                                          -- vault.secrets (null у кошельков)
  last_sync_at  timestamptz,
  cursor_at     timestamptz,                                                   -- с какого времени грузить в следующий раз
  last_error    text check (char_length(last_error) <= 500),
  created_at    timestamptz not null default now(),
  unique (user_id, exchange, api_key)
);

alter table public.exchange_connections enable row level security;
revoke all on public.exchange_connections from public, anon, authenticated;
grant select (id, user_id, exchange, label, api_key, last_sync_at, cursor_at, last_error, created_at)
  on public.exchange_connections to authenticated;

create policy exchange_connections_select_own on public.exchange_connections
  for select to authenticated using (user_id = (select auth.uid()));
create policy exchange_connections_mfa on public.exchange_connections
  as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()));


-- Какие биржи умеем и нужен ли им секрет
create or replace function public.connection_kind(p_exchange text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_exchange
    when 'bybit' then 'cex'
    when 'hyperliquid' then 'wallet'
    else null
  end;
$$;


-- Добавить подключение. Для CEX секрет сразу уходит в Vault; вернуть его наружу нельзя.
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


-- Удалить своё подключение вместе с секретом
create or replace function public.delete_exchange_connection(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  sid uuid;
begin
  if auth.uid() is null or not public.mfa_ok() then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  delete from public.exchange_connections
   where id = p_id and user_id = auth.uid()
  returning secret_id into sid;
  if sid is not null then
    delete from vault.secrets where id = sid;
  end if;
end;
$$;
revoke execute on function public.delete_exchange_connection(uuid) from public, anon;
grant  execute on function public.delete_exchange_connection(uuid) to authenticated;


-- После синхронизации: когда, с какого места продолжать, ошибка
create or replace function public.touch_exchange_connection(p_id uuid, p_cursor timestamptz, p_error text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.mfa_ok() then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  update public.exchange_connections
     set last_sync_at = now(),
         cursor_at    = coalesce(p_cursor, cursor_at),
         last_error   = left(p_error, 500)
   where id = p_id and user_id = auth.uid();
end;
$$;
revoke execute on function public.touch_exchange_connection(uuid, timestamptz, text) from public, anon;
grant  execute on function public.touch_exchange_connection(uuid, timestamptz, text) to authenticated;


-- Подключение удалено любым путём (в том числе вместе с аккаунтом) — секрет из Vault удаляется тоже
create or replace function public.drop_connection_secret()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.secret_id is not null then
    delete from vault.secrets where id = old.secret_id;
  end if;
  return old;
end;
$$;
revoke execute on function public.drop_connection_secret() from public, anon, authenticated;
create trigger exchange_connections_drop_secret after delete on public.exchange_connections
  for each row execute function public.drop_connection_secret();

-- Секрет — только серверной функции (service_role). Браузер вызвать не может.
create or replace function public.get_connection_secret(p_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select ds.decrypted_secret
  from public.exchange_connections c
  join vault.decrypted_secrets ds on ds.id = c.secret_id
  where c.id = p_id;
$$;
revoke execute on function public.get_connection_secret(uuid) from public, anon, authenticated;
grant  execute on function public.get_connection_secret(uuid) to service_role;

revoke execute on function public.connection_kind(text) from public, anon;
grant  execute on function public.connection_kind(text) to authenticated;
