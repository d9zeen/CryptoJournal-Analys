-- =====================================================================
-- 0004 — усиление защиты
--
-- Как применить: Supabase → SQL Editor → New query → вставить весь файл → Run. Один раз.
--
-- 1. Убираем лишние права, которые Supabase выдаёт по умолчанию (TRUNCATE обходит RLS).
-- 2. Проверки данных в журнале импортов.
-- 3. Потолки на число записей (защита от засорения базы).
-- 4. Хранилище: файл — только к своей существующей сделке, не больше 20 на сделку, без перезаписи.
-- 5. Двухфакторная защита (2FA): если у пользователя включён второй фактор,
--    без подтверждения кодом (aal2) база не отдаёт и не меняет его данные.
-- =====================================================================


-- 1. Права ----------------------------------------------------------------
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke truncate, references, trigger on tables from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from public, anon;

-- Служебные функции не нужны снаружи (is_valid_timezone нужна вошедшим: на ней проверка профиля)
revoke execute on function public.is_valid_timezone(text)               from public, anon;
revoke execute on function public.plan_trade_limit(public.plan_type)    from public, anon, authenticated;
revoke execute on function public.set_updated_at()                      from public, anon, authenticated;


-- 2. Журнал импортов --------------------------------------------------------
alter table public.imports
  add constraint imports_exchange_format check (exchange ~ '^[a-z0-9_]{2,20}$'),
  add constraint imports_filename_len    check (filename is null or char_length(filename) <= 200),
  add constraint imports_rows_range      check (rows_total between 0 and 100000
                                                and rows_imported between 0 and 100000
                                                and rows_skipped between 0 and 100000);


-- 3. Потолки на число записей пользователя ----------------------------------
create or replace function public.enforce_user_row_cap()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  cap int := tg_argv[0]::int;
  n   int;
begin
  execute format('select count(*) from %I.%I where user_id = $1', tg_table_schema, tg_table_name) into n using new.user_id;
  if n >= cap then
    raise exception 'ROW_LIMIT_REACHED' using errcode = 'P0001', detail = format('%s: не больше %s', tg_table_name, cap);
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_user_row_cap() from public, anon, authenticated;

create trigger setups_cap       before insert on public.setups       for each row execute function public.enforce_user_row_cap(100);
create trigger mistake_tags_cap before insert on public.mistake_tags for each row execute function public.enforce_user_row_cap(100);
create trigger emotions_cap     before insert on public.emotions     for each row execute function public.enforce_user_row_cap(100);
create trigger imports_cap      before insert on public.imports      for each row execute function public.enforce_user_row_cap(5000);
create trigger trades_cap       before insert on public.trades       for each row execute function public.enforce_user_row_cap(100000);


-- 4. Хранилище скриншотов ---------------------------------------------------
drop policy if exists screenshots_update_own on storage.objects;   -- файлы не перезаписываются
drop policy if exists screenshots_insert_own on storage.objects;

-- Сколько файлов уже лежит в папке сделки текущего пользователя.
-- Отдельная функция: правило доступа к storage.objects не может само читать storage.objects (рекурсия).
create or replace function public.my_trade_file_count(p_trade text)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from storage.objects o
  where o.bucket_id = 'screenshots'
    and o.name like (auth.uid())::text || '/' || replace(replace(p_trade, '%', ''), '_', '') || '/%';
$$;
revoke execute on function public.my_trade_file_count(text) from public, anon;
grant  execute on function public.my_trade_file_count(text) to authenticated;
create policy screenshots_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'screenshots'
    -- путь строго {user_id}/{trade_id}/{файл}
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] = (select auth.uid())::text
    -- сделка существует и принадлежит этому пользователю
    and exists (
      select 1 from public.trades t
      where t.id::text = (storage.foldername(name))[2] and t.user_id = (select auth.uid())
    )
    -- не больше 20 файлов на сделку
    and public.my_trade_file_count((storage.foldername(name))[2]) < 20
  );


-- 5. Двухфакторная защита ---------------------------------------------------
-- true, если запрос подтверждён вторым фактором (aal2) или 2FA у пользователя не включена
create or replace function public.mfa_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = auth.uid() and f.status = 'verified'
      );
$$;
revoke execute on function public.mfa_ok() from public, anon;
grant  execute on function public.mfa_ok() to authenticated;

-- «Ограничивающие» политики: работают поверх обычных (И), а не вместо них (ИЛИ)
create policy profiles_mfa          on public.profiles          as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy setups_mfa            on public.setups            as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy mistake_tags_mfa      on public.mistake_tags      as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy emotions_mfa          on public.emotions          as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy imports_mfa           on public.imports           as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy trades_mfa            on public.trades            as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy trade_mistakes_mfa    on public.trade_mistakes    as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy trade_screenshots_mfa on public.trade_screenshots as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy usage_counters_mfa    on public.usage_counters    as restrictive for all to authenticated using ((select public.mfa_ok()));
create policy screenshots_mfa       on storage.objects          as restrictive for all to authenticated
  using (bucket_id <> 'screenshots' or (select public.mfa_ok()))
  with check (bucket_id <> 'screenshots' or (select public.mfa_ok()));

-- Удаление аккаунта при включённой 2FA — только после подтверждения кодом
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.mfa_ok() then
    raise exception 'MFA_REQUIRED' using errcode = '42501';
  end if;
  delete from auth.users where id = uid;
end;
$$;
revoke execute on function public.delete_my_account() from public, anon;
grant  execute on function public.delete_my_account() to authenticated;
