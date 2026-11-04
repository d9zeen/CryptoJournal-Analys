-- =====================================================================
-- Проверка защиты на НАСТОЯЩЕЙ базе (ничего не сохраняет).
--
-- Supabase → SQL Editor → вставить файл → Run.
-- Создаёт двух временных пользователей, пробует от их имени всё разрешённое и запрещённое,
-- и в конце НАМЕРЕННО завершается ошибкой «QA-RESULT…» — так вся транзакция откатывается,
-- а в тексте ошибки видны результаты. Везде должно быть true / «отклонён».
-- =====================================================================
do $$
declare
  res text := '';
  uid uuid := '99999999-0000-0000-0000-000000000001';
  oth uuid := '99999999-0000-0000-0000-000000000002';
  tid uuid := '99999999-1111-0000-0000-000000000001';
  n int;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
    (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'qa1@example.invalid', '{"timezone":"Europe/Moscow"}', now(), now()),
    (oth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'qa2@example.invalid', '{}', now(), now());

  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  execute 'set local role authenticated';
  res := res || format(E'\n1 профиль+списки: %s', (select count(*) from public.profiles)=1 and (select count(*) from public.setups)=6);
  insert into public.trades (id, exchange, symbol, side, entry_at, exit_at, entry_price, exit_price, size_usd, fee, pnl)
    values (tid, 'bybit','BTCUSDT','long', now()-interval '1 hour', now(), 60000, 61000, 600, 0.6, 9.4);
  res := res || format(E'\n2 сделка и счётчик Free: %s', (select trades_created from public.get_my_usage())=1);
  insert into public.trade_screenshots (trade_id, path) values (tid, uid || '/' || tid || '/a.webp');
  res := res || format(E'\n3 запись скриншота: %s', (select count(*) from public.trade_screenshots)=1);
  begin
    insert into storage.objects (bucket_id, name, owner) values ('screenshots', uid || '/' || tid || '/a.webp', uid);
    res := res || E'\n4 файл к своей сделке: true';
  exception when others then res := res || E'\n4 файл к своей сделке: ОШИБКА ' || sqlerrm; end;
  begin
    insert into storage.objects (bucket_id, name, owner) values ('screenshots', uid || '/00000000-0000-0000-0000-000000000000/x.webp', uid);
    res := res || E'\n5 файл к несуществующей сделке: ПРОПУЩЕН (ПЛОХО)';
  exception when others then res := res || E'\n5 файл к несуществующей сделке отклонён: true'; end;
  begin
    update public.profiles set plan = 'pro';
    res := res || E'\n6 сам себе Pro: ПРОШЛО (ПЛОХО)';
  exception when others then res := res || E'\n6 сам себе Pro отклонён: true'; end;
  begin
    execute 'truncate public.trades';
    res := res || E'\n7 TRUNCATE: ПРОШЁЛ (ПЛОХО)';
  exception when others then res := res || E'\n7 TRUNCATE отклонён: true'; end;

  perform set_config('request.jwt.claims', json_build_object('sub', oth, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  res := res || format(E'\n8 чужие сделки/скрины/файлы не видны: %s', (select count(*) from public.trades)=0 and (select count(*) from public.trade_screenshots)=0 and (select count(*) from storage.objects where bucket_id='screenshots')=0);
  update public.trades set pnl = 0 where id = tid;
  get diagnostics n = row_count;
  res := res || format(E'\n9 чужую сделку не изменить: %s', n = 0);
  begin
    insert into storage.objects (bucket_id, name, owner) values ('screenshots', uid || '/' || tid || '/evil.webp', oth);
    res := res || E'\n10 файл в чужую папку: ПРОШЁЛ (ПЛОХО)';
  exception when others then res := res || E'\n10 файл в чужую папку отклонён: true'; end;

  execute 'reset role';
  insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
    values (gen_random_uuid(), uid, 'qa', 'totp', 'verified', now(), now(), 'x');
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  execute 'set local role authenticated';
  res := res || format(E'\n11 2FA вкл, без кода — данных нет: %s', (select count(*) from public.trades)=0 and (select count(*) from public.profiles)=0);
  begin
    perform public.delete_my_account();
    res := res || E'\n12 удаление без кода: ПРОШЛО (ПЛОХО)';
  exception when others then res := res || E'\n12 удаление без кода отклонено: ' || (sqlerrm = 'MFA_REQUIRED'); end;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  res := res || format(E'\n13 2FA вкл, с кодом — данные видны: %s', (select count(*) from public.trades)=1);

  execute 'reset role';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  begin
    perform count(*) from public.trades;
    res := res || E'\n14 гость читает сделки: ПРОШЛО (ПЛОХО)';
  exception when others then res := res || E'\n14 гостю доступ закрыт: true'; end;

  raise exception 'QA-RESULT (всё откатано):%', res;
end $$;
