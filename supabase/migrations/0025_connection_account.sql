-- =====================================================================
-- 0025 — один аккаунт биржи — одно подключение (аудит «Портфеля», 19.11.2026).
-- Раньше тот же аккаунт можно было подключить двумя разными ключами: балансы и сделки считались дважды.
-- Теперь при подключении сайт узнаёт у биржи номер аккаунта (Bybit userID, OKX uid, Bitget userId, Binance uid)
-- и запоминает его; второй раз тот же аккаунт подключить нельзя (DUPLICATE_ACCOUNT).
-- Как применить: Supabase → SQL Editor → вставить → Run. Один раз.
-- =====================================================================
alter table public.exchange_connections
  add column if not exists account_uid text check (account_uid is null or char_length(account_uid) between 1 and 64);

create unique index if not exists exchange_connections_account_uid_key
  on public.exchange_connections (user_id, exchange, account_uid) where account_uid is not null;

-- номер аккаунта биржи для своего подключения; такой аккаунт уже подключён — DUPLICATE_ACCOUNT
create or replace function public.set_connection_account(p_id uuid, p_uid text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.mfa_ok() then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if p_uid is null or char_length(p_uid) not between 1 and 64 then
    raise exception 'BAD_UID' using errcode = 'P0001';
  end if;
  begin
    update public.exchange_connections set account_uid = p_uid
     where id = p_id and user_id = auth.uid();
  exception when unique_violation then
    raise exception 'DUPLICATE_ACCOUNT' using errcode = 'P0001';
  end;
end;
$$;
revoke execute on function public.set_connection_account(uuid, text) from public, anon;
grant  execute on function public.set_connection_account(uuid, text) to authenticated;
