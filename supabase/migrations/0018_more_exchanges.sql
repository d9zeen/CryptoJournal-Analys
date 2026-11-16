-- =====================================================================
-- 0018 — Подключение по API ещё четырёх бирж: Binance, OKX, BingX, Bitget (ключ «только чтение», как у Bybit).
--  * connection_kind: новые биржи — 'cex' (ключ API + секрет в Vault);
--  * add_exchange_connection получает пятый параметр p_passphrase — кодовая фраза ключа (у OKX и Bitget обязательна):
--    секрет и фраза хранятся в Vault одной строкой JSON {"s": секрет, "p": фраза}; браузер их по-прежнему не видит,
--    читает только серверная функция (get_connection_secret — только service_role);
--  * формат ключа шире: у OKX ключ с дефисами (UUID), у Bitget — с подчёркиванием (bg_…), у Binance / BingX — до 64+ символов.
--  * тарифы не меняются: биржи по ключу — с Pro (connection_plan_ok, 0016).
--
-- Применять ПОСЛЕ 0016 и 0017. Как применить: Supabase → SQL Editor → New query → вставить весь файл → Run. Один раз.
-- =====================================================================

create or replace function public.connection_kind(p_exchange text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_exchange
    when 'bybit' then 'cex'
    when 'binance' then 'cex'
    when 'okx' then 'cex'
    when 'bingx' then 'cex'
    when 'bitget' then 'cex'
    when 'hyperliquid' then 'wallet'
    when 'polymarket' then 'wallet'
    else null
  end;
$$;
revoke execute on function public.connection_kind(text) from public, anon;
grant  execute on function public.connection_kind(text) to authenticated;

-- старая версия на 4 параметра — убираем, чтобы вызов по именам не путался между двумя функциями
drop function if exists public.add_exchange_connection(text, text, text, text);

create or replace function public.add_exchange_connection(
  p_exchange   text,
  p_api_key    text,
  p_secret     text default null,
  p_label      text default null,
  p_passphrase text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid  uuid := auth.uid();
  kind text := public.connection_kind(p_exchange);
  key  text := btrim(coalesce(p_api_key, ''));
  sec  text := btrim(coalesce(p_secret, ''));
  needs_phrase boolean := p_exchange in ('okx', 'bitget');
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
    -- ключ: латиница, цифры, дефис, подчёркивание; секрет — без пробелов и управляющих символов
    if key !~ '^[A-Za-z0-9_-]{8,128}$' or char_length(sec) not between 8 and 256 or sec ~ '[[:space:][:cntrl:]]' then
      raise exception 'BAD_API_KEY' using errcode = '22023';
    end if;
    if needs_phrase and (p_passphrase is null or char_length(p_passphrase) not between 1 and 64 or p_passphrase ~ '[[:cntrl:]]') then
      raise exception 'PASSPHRASE_REQUIRED' using errcode = '22023';
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
    sid := vault.create_secret(
      case when needs_phrase then jsonb_build_object('s', sec, 'p', p_passphrase)::text else sec end,
      'cj_' || gen_random_uuid()::text,
      'CryptoJournal: ключ API ' || p_exchange
    );
  end if;

  insert into public.exchange_connections (user_id, exchange, label, api_key, secret_id)
  values (uid, p_exchange, nullif(btrim(coalesce(p_label, '')), ''), key, sid)
  returning id into new_id;
  return new_id;
end;
$$;
revoke execute on function public.add_exchange_connection(text, text, text, text, text) from public, anon;
grant  execute on function public.add_exchange_connection(text, text, text, text, text) to authenticated;
