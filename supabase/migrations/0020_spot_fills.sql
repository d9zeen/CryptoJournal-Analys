-- =====================================================================
-- 0020 — Портфель, этап 2: средняя цена входа и зафиксированная прибыль из истории спотовых покупок / продаж (16.11.2026).
--
--  * spot_fills — исполнения спотовых сделок с подключённых бирж (Bybit, Binance, OKX): монета, валюта котировки,
--    покупка / продажа, количество, цена, комиссия, время. Из них сайт считает среднюю цену входа по монете
--    (средневзвешенная, lib/calc/portfolio.ts → costBasis) и прибыль, зафиксированную продажами.
--    Пишет только база функцией add_spot_fills (своё подключение в пределах тарифа) — напрямую не подделать.
--    Повторы отсекаются: unique (connection_id, external_id).
--  * spot_sync — откуда продолжать скачивать исполнения по каждому подключению (cursor_at), чтобы не тянуть всю историю каждый раз.
--  * RLS user_id = auth.uid() + 2FA; удаление подключения или аккаунта удаляет и историю (cascade).
--
-- Как применить: Supabase → SQL Editor → New query → вставить весь файл → Run. Один раз.
-- =====================================================================

create table public.spot_fills (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  connection_id uuid not null references public.exchange_connections (id) on delete cascade,
  external_id   text not null check (char_length(external_id) between 1 and 120),
  asset         text not null check (asset ~ '^[A-Z0-9._-]{1,24}$'),
  quote         text not null check (quote ~ '^[A-Z0-9._-]{1,24}$'),
  side          text not null check (side in ('buy', 'sell')),
  qty           numeric not null check (qty > 0 and qty < 1e18),
  price         numeric not null check (price > 0 and price < 1e15),
  fee           numeric not null default 0 check (fee >= 0 and fee < 1e18),
  fee_asset     text check (fee_asset is null or fee_asset ~ '^[A-Z0-9._-]{1,24}$'),
  at            timestamptz not null,
  unique (connection_id, external_id)
);
create index spot_fills_user_asset_idx on public.spot_fills (user_id, asset, at);

alter table public.spot_fills enable row level security;
create policy spot_fills_select on public.spot_fills for select to authenticated using (user_id = (select auth.uid()));
create policy spot_fills_mfa on public.spot_fills
  as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
revoke all on public.spot_fills from anon, authenticated;
grant select on public.spot_fills to authenticated;

create table public.spot_sync (
  connection_id uuid primary key references public.exchange_connections (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  cursor_at     timestamptz not null
);
alter table public.spot_sync enable row level security;
create policy spot_sync_select on public.spot_sync for select to authenticated using (user_id = (select auth.uid()));
create policy spot_sync_mfa on public.spot_sync
  as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
revoke all on public.spot_sync from anon, authenticated;
grant select on public.spot_sync to authenticated;


-- Записать исполнения (повторы пропускаются) и запомнить, откуда продолжать. p_items — до 5000 за вызов:
-- [{external_id, asset, quote, side, qty, price, fee, fee_asset, at}]. Потолок — 200 000 исполнений на человека.
create or replace function public.add_spot_fills_for(p_user uuid, p_connection uuid, p_items jsonb, p_cursor timestamptz)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 5000 then
    raise exception 'BAD_ITEMS' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.exchange_connections c where c.id = p_connection and c.user_id = p_user) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_items) > 0
     and (select count(*) from public.spot_fills f where f.user_id = p_user) + jsonb_array_length(p_items) > 200000 then
    raise exception 'ROW_LIMIT_REACHED' using errcode = 'P0001';
  end if;
  insert into public.spot_fills (user_id, connection_id, external_id, asset, quote, side, qty, price, fee, fee_asset, at)
  select p_user, p_connection, x.external_id, upper(x.asset), upper(x.quote), x.side, x.qty, x.price, coalesce(x.fee, 0), upper(x.fee_asset), x.at
    from jsonb_to_recordset(p_items) as x(external_id text, asset text, quote text, side text, qty numeric, price numeric, fee numeric, fee_asset text, at timestamptz)
  on conflict (connection_id, external_id) do nothing;
  get diagnostics n = row_count;
  if p_cursor is not null then
    insert into public.spot_sync (connection_id, user_id, cursor_at) values (p_connection, p_user, least(p_cursor, now()))
    on conflict (connection_id) do update set cursor_at = greatest(public.spot_sync.cursor_at, excluded.cursor_at);
  end if;
  return n;
end;
$$;
revoke execute on function public.add_spot_fills_for(uuid, uuid, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.add_spot_fills_for(uuid, uuid, jsonb, timestamptz) to service_role;

-- Из браузера: только своё подключение, с 2FA и в пределах тарифа
create or replace function public.add_spot_fills(p_connection uuid, p_items jsonb, p_cursor timestamptz)
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
  return public.add_spot_fills_for(auth.uid(), p_connection, p_items, p_cursor);
end;
$$;
revoke execute on function public.add_spot_fills(uuid, jsonb, timestamptz) from public, anon;
grant execute on function public.add_spot_fills(uuid, jsonb, timestamptz) to authenticated;
