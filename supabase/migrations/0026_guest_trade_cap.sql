-- 0026 — лимит сделок для гостя демо (26.11.2026, проверка «на дыры»; владелец: «меняй на 500»).
-- Гость («Открыть демо», анонимный вход) получает пробный Pro Plus, а там сделки без лимита —
-- можно было завести много гостей и раздуть базу мусорными сделками. Теперь у гостя не больше 500 сделок всего
-- (в демо 60). Сохранил аккаунт (почта + пароль) — лимит снимается сам: токен уже без is_anonymous.
create or replace function public.enforce_guest_trade_cap()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  n int;
begin
  if not public.is_guest() then
    return new;
  end if;
  select count(*) into n from public.trades where user_id = new.user_id;
  if n >= 500 then
    raise exception 'GUEST_TRADE_LIMIT' using errcode = 'P0001', detail = 'В демо — не больше 500 сделок';
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_guest_trade_cap() from public, anon, authenticated;

create trigger trades_guest_cap before insert on public.trades
  for each row execute function public.enforce_guest_trade_cap();
