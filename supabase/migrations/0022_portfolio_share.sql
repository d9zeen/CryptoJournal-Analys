-- =====================================================================
-- 0022 — Ссылка «поделиться портфелем» (только просмотр, без входа).
--  * portfolio_shares — одна ссылка на человека: случайный токен (122 бита, gen_random_uuid без дефисов) и «показывать суммы».
--    По умолчанию суммы скрыты: видны доли, изменение за сутки и график в процентах.
--  * создать / поменять настройку — share_portfolio(p_show_amounts) (токен сохраняется, ссылка не меняется);
--    новая ссылка (старая перестаёт работать) — share_portfolio(..., p_new_token => true); выключить — unshare_portfolio().
--  * shared_portfolio(p_token) — для всех, в том числе без входа (anon): отдаёт только то, что разрешил владелец:
--    монеты (символ, название, иконка, цвет, доля, изменение 24 ч / 7 д, мини-график), и — если разрешил — стоимость.
--    Ни почты, ни id, ни бирж, ни адресов кошельков, ни количества монет. Неверный токен — null.
--  * RLS + 2FA на таблице; писать в неё напрямую нельзя — только функциями.
--
-- Применять ПОСЛЕ 0021. Как применить: Supabase → SQL Editor → New query → вставить весь файл → Run. Один раз.
-- =====================================================================

create table public.portfolio_shares (
  user_id      uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  token        text not null unique check (token ~ '^[0-9a-f]{32}$'),
  show_amounts boolean not null default false,
  created_at   timestamptz not null default now()
);
alter table public.portfolio_shares enable row level security;
create policy portfolio_shares_select_own on public.portfolio_shares for select to authenticated using (user_id = (select auth.uid()));
create policy portfolio_shares_mfa on public.portfolio_shares
  as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
revoke all on public.portfolio_shares from anon, authenticated;
grant select on public.portfolio_shares to authenticated;

-- Включить ссылку / поменять «показывать суммы»; p_new_token — выдать новую ссылку (старая перестаёт открываться)
create or replace function public.share_portfolio(p_show_amounts boolean default false, p_new_token boolean default false)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  tok text;
begin
  if uid is null or not public.mfa_ok() then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  insert into public.portfolio_shares (user_id, token, show_amounts)
  values (uid, replace(gen_random_uuid()::text, '-', ''), coalesce(p_show_amounts, false))
  on conflict (user_id) do update
    set show_amounts = excluded.show_amounts,
        token = case when p_new_token then excluded.token else public.portfolio_shares.token end,
        created_at = case when p_new_token then now() else public.portfolio_shares.created_at end
  returning token into tok;
  return tok;
end;
$$;
revoke execute on function public.share_portfolio(boolean, boolean) from public, anon;
grant execute on function public.share_portfolio(boolean, boolean) to authenticated;

create or replace function public.unshare_portfolio()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.mfa_ok() then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  delete from public.portfolio_shares where user_id = auth.uid();
end;
$$;
revoke execute on function public.unshare_portfolio() from public, anon;
grant execute on function public.unshare_portfolio() to authenticated;

-- Портфель по ссылке. Цена монеты — как в снимке (portfolio_snapshot_for): у монеты с этим символом с большей капитализацией.
-- Монеты дешевле 1 $ и без цены не показываем. График — снимки за 90 дней (не больше одной точки в сутки);
-- без сумм — в процентах к первой точке.
create or replace function public.shared_portfolio(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s       public.portfolio_shares;
  v_total numeric;
  v_coins jsonb;
  v_hist  jsonb;
  v_first numeric;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then
    return null;
  end if;
  select * into s from public.portfolio_shares where token = p_token;
  if not found then
    return null;
  end if;

  with h as (
    select h.symbol, sum(h.amount) as amount, sum(h.value_usd) as known
      from public.holdings h where h.user_id = s.user_id group by h.symbol
  ), p as (
    select distinct on (c.symbol) c.symbol, c.name, c.price, c.icon, c.color, c.change_24h, c.change_7d, c.spark
      from public.coins c where c.price is not null order by c.symbol, c.rank nulls last
  ), v as (
    select h.symbol, p.name, p.icon, p.color, p.change_24h, p.change_7d, p.spark, coalesce(h.known, h.amount * p.price) as usd
      from h left join p on p.symbol = h.symbol
  ), ok as (
    select * from v where usd is not null and usd >= 1
  ), tot as (
    select sum(usd) as total from ok
  )
  select (select total from tot),
         coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'symbol', ok.symbol,
           'name', ok.name,
           'icon', ok.icon,
           'color', ok.color,
           'share', round(ok.usd / nullif((select total from tot), 0), 6),
           'change_24h', ok.change_24h,
           'change_7d', ok.change_7d,
           'spark', ok.spark,
           'value', case when s.show_amounts then round(ok.usd, 2) end
         )) order by ok.usd desc), '[]'::jsonb)
    into v_total, v_coins
    from ok;

  -- история: последний снимок каждого дня за 90 дней
  select ps.total_usd into v_first
    from public.portfolio_snapshots ps
   where ps.user_id = s.user_id and ps.at > now() - interval '90 days' and ps.total_usd > 0
   order by ps.at limit 1;
  select coalesce(jsonb_agg(jsonb_build_object(
           't', d.at,
           'v', case when s.show_amounts then d.total_usd else round(d.total_usd / v_first * 100, 2) end
         ) order by d.at), '[]'::jsonb)
    into v_hist
    from (
      select distinct on (date_trunc('day', ps.at)) ps.at, ps.total_usd
        from public.portfolio_snapshots ps
       where ps.user_id = s.user_id and ps.at > now() - interval '90 days' and ps.total_usd > 0
       order by date_trunc('day', ps.at), ps.at desc
    ) d;

  return jsonb_build_object(
    'show_amounts', s.show_amounts,
    'total', case when s.show_amounts then round(coalesce(v_total, 0), 2) end,
    'coins', v_coins,
    'history', case when v_first is null then '[]'::jsonb else v_hist end
  );
end;
$$;
revoke execute on function public.shared_portfolio(text) from public;
grant execute on function public.shared_portfolio(text) to anon, authenticated;
