-- =====================================================================
-- 0019 — Портфель: что человек держит сейчас и сколько это стоит (вкладка «Портфель», 16.11.2026).
--
--  * coins — рыночные данные (топ-500 CoinGecko): цена, изменение за 24 ч и 7 дней, мини-график за 7 дней, иконка.
--    Пишет только сервер (функция prices-worker, service_role) раз в 10 минут; люди только читают (RLS + 2FA).
--    Иконки лежат в нашем Storage (bucket coin-icons, публичный): браузер не ходит на чужие сайты (CSP),
--    и CoinGecko не узнаёт, какие монеты у человека.
--  * holdings — балансы: по подключению биржи (connection_id) или вручную (connection_id = null).
--    Балансы биржи заменяются целиком только после успешного ответа биржи (replace_holdings): если биржа не ответила,
--    остаются последние известные — график не «падает» на пустом месте.
--  * asset_costs — средняя цена входа по монете (пока руками; этап 2 — из истории покупок).
--  * portfolio_snapshots — «сколько стоило»: пишет ТОЛЬКО база (portfolio_snapshot / portfolio_snapshot_for) по своим
--    балансам и своим ценам; вставить снимок руками нельзя — историю не подделать. Не чаще раза в 50 минут.
--  * везде RLS user_id = auth.uid() + restrictive-политика 2FA; потолок строк; удаление аккаунта удаляет всё (cascade).
--  * cj-prices: pg_cron каждые 10 минут → dispatch_prices() → pg_net → prices-worker (секрет cj_sync_secret из Vault).
--
-- Как применить: Supabase → SQL Editor → New query → вставить весь файл → Run. Один раз.
-- Потом выложить функцию prices-worker (verify_jwt = false) — она сама наполнит цены и иконки за несколько запусков.
-- =====================================================================

-- ---------- Монеты (рыночные данные) ----------
create table public.coins (
  id          text primary key check (id ~ '^[a-z0-9-]{1,80}$'),     -- id CoinGecko: bitcoin
  symbol      text not null check (symbol ~ '^[A-Z0-9._-]{1,24}$'),   -- BTC
  name        text not null check (char_length(name) <= 100),
  rank        int,                                                    -- место по капитализации
  price       numeric check (price is null or price >= 0),
  change_24h  numeric,                                                -- %
  change_7d   numeric,                                                -- %
  spark       jsonb,                                                  -- цены за 7 дней, до 42 точек
  icon        text check (icon is null or icon ~ '^[a-z0-9-]{1,80}\.(png|jpg|webp)$'),  -- файл в coin-icons
  image_src   text,                                                   -- откуда сервер качает иконку
  updated_at  timestamptz not null default now()
);
create index coins_symbol_idx on public.coins (symbol, rank);

alter table public.coins enable row level security;
create policy coins_select on public.coins for select to authenticated using (true);
create policy coins_mfa on public.coins
  as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
revoke all on public.coins from anon, authenticated;
-- все поля, кроме image_src (откуда сервер качает иконку — браузеру не нужно)
grant select (id, symbol, name, rank, price, change_24h, change_7d, spark, icon, updated_at) on public.coins to authenticated;

-- Иконки монет: публичный bucket, пишет только сервер (service_role); только картинки-растры до 200 КБ (без SVG)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('coin-icons', 'coin-icons', true, 204800, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;


-- ---------- Балансы ----------
create table public.holdings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  connection_id uuid references public.exchange_connections (id) on delete cascade,  -- null — монета вручную
  account       text not null default 'spot' check (account in ('spot', 'fund', 'futures', 'earn', 'perp', 'prediction', 'manual')),
  symbol        text not null check (symbol ~ '^[A-Z0-9._-]{1,24}$'),
  amount        numeric not null check (amount >= 0 and amount < 1e18),
  -- стоимость, если она известна без цены монеты (позиции Polymarket); иначе — amount × цена из coins
  value_usd     numeric check (value_usd is null or (value_usd >= 0 and value_usd < 1e15)),
  note          text check (note is null or char_length(note) <= 100),
  updated_at    timestamptz not null default now()
);
create index holdings_user_id_idx on public.holdings (user_id);
create index holdings_connection_id_idx on public.holdings (connection_id);

create trigger holdings_updated_at before update on public.holdings
  for each row execute function public.set_updated_at();
create trigger holdings_row_cap before insert on public.holdings
  for each row execute function public.enforce_user_row_cap('3000');

alter table public.holdings enable row level security;
create policy holdings_select on public.holdings for select to authenticated using (user_id = (select auth.uid()));
-- руками — только свои монеты без подключения; балансы бирж пишет replace_holdings
create policy holdings_insert on public.holdings for insert to authenticated
  with check (user_id = (select auth.uid()) and connection_id is null and account = 'manual');
create policy holdings_update on public.holdings for update to authenticated
  using (user_id = (select auth.uid()) and connection_id is null)
  with check (user_id = (select auth.uid()) and connection_id is null and account = 'manual');
create policy holdings_delete on public.holdings for delete to authenticated
  using (user_id = (select auth.uid()) and connection_id is null);
create policy holdings_mfa on public.holdings
  as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
grant select, insert, update, delete on public.holdings to authenticated;
revoke all on public.holdings from anon;


-- ---------- Средняя цена входа ----------
create table public.asset_costs (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  symbol     text not null check (symbol ~ '^[A-Z0-9._-]{1,24}$'),
  avg_price  numeric not null check (avg_price > 0 and avg_price < 1e12),
  updated_at timestamptz not null default now(),
  primary key (user_id, symbol)
);
create trigger asset_costs_updated_at before update on public.asset_costs
  for each row execute function public.set_updated_at();
create trigger asset_costs_row_cap before insert on public.asset_costs
  for each row execute function public.enforce_user_row_cap('3000');

alter table public.asset_costs enable row level security;
create policy asset_costs_select on public.asset_costs for select to authenticated using (user_id = (select auth.uid()));
create policy asset_costs_insert on public.asset_costs for insert to authenticated with check (user_id = (select auth.uid()));
create policy asset_costs_update on public.asset_costs for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy asset_costs_delete on public.asset_costs for delete to authenticated using (user_id = (select auth.uid()));
create policy asset_costs_mfa on public.asset_costs
  as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
grant select, insert, update, delete on public.asset_costs to authenticated;
revoke all on public.asset_costs from anon;


-- ---------- Снимки стоимости ----------
create table public.portfolio_snapshots (
  id        bigint generated always as identity primary key,
  user_id   uuid not null references auth.users (id) on delete cascade,
  at        timestamptz not null default now(),
  total_usd numeric not null check (total_usd >= 0),
  btc_price numeric,                         -- цена BTC в момент снимка: линия «если бы всё было в BTC»
  parts     jsonb not null default '{}'      -- {"BTC": 23750.12, ...}
);
create index portfolio_snapshots_user_at_idx on public.portfolio_snapshots (user_id, at desc);

alter table public.portfolio_snapshots enable row level security;
create policy portfolio_snapshots_select on public.portfolio_snapshots for select to authenticated using (user_id = (select auth.uid()));
create policy portfolio_snapshots_mfa on public.portfolio_snapshots
  as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
-- только чтение: снимки пишет база (в Supabase у новых таблиц по умолчанию есть все права — снимаем)
revoke all on public.portfolio_snapshots from anon, authenticated;
grant select on public.portfolio_snapshots to authenticated;


-- ---------- Балансы биржи: заменить целиком ----------
-- p_items — [{account, symbol, amount, value_usd?}], не больше 500. Сначала удаляем старые балансы подключения, потом пишем новые
-- (одна транзакция). Проверки данных — ограничения таблицы.
create or replace function public.replace_holdings_for(p_user uuid, p_connection uuid, p_items jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 500 then
    raise exception 'BAD_ITEMS' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.exchange_connections c where c.id = p_connection and c.user_id = p_user) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  delete from public.holdings where connection_id = p_connection and user_id = p_user;
  insert into public.holdings (user_id, connection_id, account, symbol, amount, value_usd)
  select p_user, p_connection, x.account, upper(x.symbol), x.amount, x.value_usd
    from jsonb_to_recordset(p_items) as x(account text, symbol text, amount numeric, value_usd numeric)
   where x.amount > 0 or coalesce(x.value_usd, 0) > 0;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.replace_holdings_for(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_holdings_for(uuid, uuid, jsonb) to service_role;

-- Из браузера: только своё подключение и только с 2FA (если она включена) и в пределах тарифа
create or replace function public.replace_holdings(p_connection uuid, p_items jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.mfa_ok() then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.connection_active(p_connection) then
    raise exception 'PLAN_REQUIRED' using errcode = 'P0001';
  end if;
  return public.replace_holdings_for(auth.uid(), p_connection, p_items);
end;
$$;
revoke execute on function public.replace_holdings(uuid, jsonb) from public, anon;
grant execute on function public.replace_holdings(uuid, jsonb) to authenticated;


-- ---------- Снимок стоимости ----------
-- Стоимость = сумма по монетам: value_usd (если известна) или количество × цена монеты с этим символом
-- (при совпадении символов — монета с большей капитализацией). Монеты без цены в сумму не входят.
create or replace function public.portfolio_snapshot_for(p_user uuid)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total numeric;
  v_parts jsonb;
  v_btc   numeric;
begin
  if exists (select 1 from public.portfolio_snapshots s where s.user_id = p_user and s.at > now() - interval '50 minutes') then
    return null;
  end if;
  with h as (
    select h.symbol, sum(h.amount) as amount, sum(h.value_usd) as known
      from public.holdings h where h.user_id = p_user group by h.symbol
  ), p as (
    select distinct on (c.symbol) c.symbol, c.price
      from public.coins c where c.price is not null order by c.symbol, c.rank nulls last
  ), v as (
    select h.symbol, coalesce(h.known, h.amount * p.price) as usd
      from h left join p on p.symbol = h.symbol
  )
  select coalesce(sum(usd), 0), coalesce(jsonb_object_agg(symbol, round(usd, 2)) filter (where usd > 0), '{}')
    into v_total, v_parts
    from v where usd is not null;
  if v_parts = '{}'::jsonb then
    return null; -- нечего записывать (нет монет или нет цен)
  end if;
  select c.price into v_btc from public.coins c where c.symbol = 'BTC' and c.price is not null order by c.rank nulls last limit 1;
  insert into public.portfolio_snapshots (user_id, total_usd, btc_price, parts) values (p_user, round(v_total, 2), v_btc, v_parts);
  return round(v_total, 2);
end;
$$;
revoke execute on function public.portfolio_snapshot_for(uuid) from public, anon, authenticated;
grant execute on function public.portfolio_snapshot_for(uuid) to service_role;

create or replace function public.portfolio_snapshot()
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.mfa_ok() then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  return public.portfolio_snapshot_for(auth.uid());
end;
$$;
revoke execute on function public.portfolio_snapshot() from public, anon;
grant execute on function public.portfolio_snapshot() to authenticated;


-- ---------- Ключ CoinGecko (необязательно) ----------
-- Без ключа prices-worker ходит в бесплатный публичный API CoinGecko. Если владелец заведёт бесплатный Demo-ключ:
--   select vault.create_secret('<ключ>', 'cj_coingecko_key', 'CryptoJournal: ключ CoinGecko Demo');
create or replace function public.coingecko_key()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'cj_coingecko_key' limit 1;
$$;
revoke execute on function public.coingecko_key() from public, anon, authenticated;
grant execute on function public.coingecko_key() to service_role;


-- ---------- Цены каждые 10 минут ----------
create or replace function public.dispatch_prices()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  base   text;
  secret text;
begin
  select decrypted_secret into base from vault.decrypted_secrets where name = 'cj_project_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'cj_sync_secret';
  if base is null or secret is null then
    raise notice 'dispatch_prices: нет cj_project_url или cj_sync_secret в Vault';
    return;
  end if;
  perform net.http_post(
    url := rtrim(base, '/') || '/functions/v1/prices-worker',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-secret', secret, 'x-region', 'eu-central-1'),
    timeout_milliseconds := 120000
  );
end;
$$;
revoke execute on function public.dispatch_prices() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('cj-prices', '*/10 * * * *', 'select public.dispatch_prices()');
  end if;
end $$;
