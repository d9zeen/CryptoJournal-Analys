-- 0024 — демо без регистрации (19.11.2026): гость = анонимный пользователь Supabase (signInAnonymously).
-- Гость — обычный пользователь (RLS, тариф, пробный Pro Plus 7 дней — как у всех), но:
--   • не подключает биржи и кошельки (ключи и адреса — только в настоящем аккаунте),
--   • не делится портфелем по ссылке,
--   • не загружает скриншоты (Storage — только настоящим аккаунтам),
--   • удаляется сам через 7 дней (pg_cron cj-guests), если не сохранил аккаунт (почта + пароль).
-- Владельцу: Supabase → Authentication → Sign In / Providers → «Allow anonymous sign-ins» — включить.

-- Гость ли тот, кто делает запрос: признак is_anonymous в токене Supabase. Сервер (cron, sync-worker) — не гость.
create or replace function public.is_guest()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
$$;
revoke execute on function public.is_guest() from public, anon;
grant  execute on function public.is_guest() to authenticated;

-- Запрет для гостя — триггером: срабатывает и внутри функций security definer (add_exchange_connection и т. п.)
create or replace function public.guest_forbidden()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_guest() then
    raise exception 'GUEST_FORBIDDEN' using errcode = '42501', hint = 'Сохрани аккаунт (почта и пароль), чтобы это сделать';
  end if;
  return new;
end;
$$;
revoke execute on function public.guest_forbidden() from public, anon, authenticated;

create trigger exchange_connections_no_guest before insert on public.exchange_connections
  for each row execute function public.guest_forbidden();
create trigger portfolio_shares_no_guest before insert on public.portfolio_shares
  for each row execute function public.guest_forbidden();
create trigger trade_screenshots_no_guest before insert on public.trade_screenshots
  for each row execute function public.guest_forbidden();

-- Файлы в Storage: гостю нельзя ничего загружать (restrictive — вместе с обычной политикой «своя папка»)
create policy screenshots_no_guest on storage.objects as restrictive for insert to authenticated
  with check (not public.is_guest());

-- Чистка: гости старше 7 дней удаляются со всеми данными (каскад от auth.users)
create or replace function public.cleanup_guests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from auth.users where is_anonymous and created_at < now() - interval '7 days';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.cleanup_guests() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('cj-guests', '23 4 * * *', 'select public.cleanup_guests()');
  end if;
end $$;
