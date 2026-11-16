-- =====================================================================
-- 0021 — Кошельки для «Портфеля»: EVM (один адрес — Ethereum, Arbitrum, Base, BNB Chain, Optimism, Polygon) и Solana.
--  * connection_kind: 'evm' и 'solana' — 'wallet' (только публичный адрес, без ключей; сделок у кошелька нет — только балансы);
--  * add_exchange_connection: адрес Solana — base58, 32–44 символа, регистр не меняем (у EVM — 0x + 40, в нижний регистр);
--  * holdings.account: новое значение 'wallet' (монеты в кошельке);
--  * coins.platforms — адреса контрактов монеты в сетях ({"ethereum": "0x…", "solana": "mint…"}), из CoinGecko (prices-worker раз в сутки).
--    По ним сайт и сервер спрашивают балансы кошелька только у настоящих монет из нашего списка — спам-токены не попадают.
--  * тарифы — как у Hyperliquid: с Pro, кошелёк — одно из подключений тарифа.
--
-- Применять ПОСЛЕ 0020. Как применить: Supabase → SQL Editor → New query → вставить весь файл → Run. Один раз.
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
    when 'evm' then 'wallet'
    when 'solana' then 'wallet'
    else null
  end;
$$;
revoke execute on function public.connection_kind(text) from public, anon;
grant  execute on function public.connection_kind(text) to authenticated;


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
  if p_exchange = 'solana' then
    -- адрес Solana: base58 (без 0, O, I, l), 32–44 символа; регистр важен — не меняем
    if key !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' then
      raise exception 'BAD_WALLET' using errcode = '22023';
    end if;
  elsif kind = 'wallet' then
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

-- монеты в кошельке
alter table public.holdings drop constraint if exists holdings_account_check;
alter table public.holdings add constraint holdings_account_check
  check (account in ('spot', 'fund', 'futures', 'earn', 'perp', 'prediction', 'manual', 'wallet'));

-- адреса контрактов монеты по сетям (только известные сети, адреса — без пробелов и кавычек)
alter table public.coins add column platforms jsonb
  check (platforms is null or (jsonb_typeof(platforms) = 'object' and octet_length(platforms::text) < 4000));
grant select (platforms) on public.coins to authenticated;
