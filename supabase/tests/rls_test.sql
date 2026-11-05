-- Тесты безопасности и бизнес-правил схемы. Запуск: scripts/test-db.sh
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

create function pg_temp.expect_error(q text, pattern text) returns void language plpgsql as $$
begin
  execute q;
  raise exception 'ОЖИДАЛАСЬ ОШИБКА (%), но запрос прошёл: %', pattern, q;
exception when others then
  if sqlerrm !~* pattern then
    raise exception 'Не та ошибка. Ждали %, получили: %', pattern, sqlerrm;
  end if;
end $$;

create function pg_temp.check(cond boolean, msg text) returns void language plpgsql as $$
begin
  if not cond then raise exception 'ПРОВАЛ: %', msg; end if;
  raise notice 'ok — %', msg;
end $$;


-- Два пользователя
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@test', '{"timezone":"Europe/Moscow"}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@test', '{"timezone":"Not/AZone"}');

select pg_temp.check((select timezone from profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'Europe/Moscow', 'профиль создан с часовым поясом из регистрации');
select pg_temp.check((select timezone from profiles where id = 'bbbbbbbb-0000-0000-0000-000000000002') = 'UTC', 'неверный часовой пояс → UTC');
select pg_temp.check((select count(*) from setups where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 6, 'созданы стартовые сетапы');
select pg_temp.check((select count(*) from mistake_tags where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 10, 'созданы стартовые теги ошибок');
select pg_temp.check((select count(*) from emotions where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 8, 'созданы стартовые эмоции');

-- Сделка пользователя B (от его имени)
set role authenticated;
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
insert into trades (id, exchange, symbol, side, entry_at, entry_price, size_usd)
values ('bbbbbbbb-1111-0000-0000-000000000000', 'bybit', 'ETHUSDT', 'short', now(), 3000, 500);
insert into storage.objects (bucket_id, name) values ('screenshots', 'bbbbbbbb-0000-0000-0000-000000000002/bbbbbbbb-1111-0000-0000-000000000000/x.webp');

-- Дальше работаем как A
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

select pg_temp.check((select count(*) from profiles) = 1, 'A видит только свой профиль');
select pg_temp.check((select count(*) from trades) = 0, 'A не видит сделки B');
select pg_temp.check((select count(*) from setups) = 6, 'A видит только свои сетапы');
select pg_temp.check((select count(*) from storage.objects) = 0, 'A не видит скриншоты B');

select pg_temp.expect_error($$update profiles set plan = 'pro'$$, 'permission denied');
select pg_temp.check(true, 'A не может сам включить себе Pro');
select pg_temp.expect_error($$update profiles set plan_until = now() + interval '1 year'$$, 'permission denied');
select pg_temp.check(true, 'A не может продлить Pro');
update profiles set timezone = 'Asia/Almaty', starting_balance = 1000;
select pg_temp.check((select timezone from profiles) = 'Asia/Almaty', 'A меняет часовой пояс и депозит');
select pg_temp.expect_error($$update profiles set timezone = 'Mars/Base'$$, 'check constraint');
select pg_temp.check(true, 'несуществующий часовой пояс отклоняется');

update trades set note = 'взлом' where id = 'bbbbbbbb-1111-0000-0000-000000000000';
delete from trades where id = 'bbbbbbbb-1111-0000-0000-000000000000';
reset role;
select pg_temp.check((select note is null from trades where id = 'bbbbbbbb-1111-0000-0000-000000000000'), 'A не может изменить или удалить сделку B');
set role authenticated;

select pg_temp.expect_error($$insert into trades (user_id, exchange, symbol, side, entry_at, entry_price, size_usd)
  values ('bbbbbbbb-0000-0000-0000-000000000002', 'bybit', 'BTCUSDT', 'long', now(), 1, 1)$$, 'row-level security');
select pg_temp.check(true, 'A не может создать сделку от имени B');

-- чужой сетап: берём id суперпользователем
reset role;
select id as b_setup from setups where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' limit 1 \gset
select id as b_tag from mistake_tags where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' limit 1 \gset
set role authenticated;
select pg_temp.expect_error(format($$insert into trades (exchange, symbol, side, entry_at, entry_price, size_usd, setup_id)
  values ('bybit', 'BTCUSDT', 'long', now(), 1, 1, %L)$$, :'b_setup'), 'foreign key');
select pg_temp.check(true, 'нельзя привязать чужой сетап');

-- Правила целостности
select pg_temp.expect_error($$insert into trades (exchange, symbol, side, entry_at, entry_price, size_usd, pnl)
  values ('bybit', 'BTCUSDT', 'long', now(), 1, 1, 10)$$, 'trades_pnl_only_closed');
select pg_temp.check(true, 'у открытой сделки не может быть PnL');
select pg_temp.expect_error($$insert into trades (exchange, market_type, symbol, side, entry_at, entry_price, size_usd)
  values ('bybit', 'spot', 'BTCUSDT', 'short', now(), 1, 1)$$, 'trades_spot_rules');
select pg_temp.check(true, 'спот short запрещён');
select pg_temp.expect_error($$insert into trades (exchange, symbol, side, entry_at, exit_at, entry_price, exit_price, size_usd, pnl)
  values ('bybit', 'BTCUSDT', 'long', now(), now() - interval '1 hour', 1, 2, 1, 1)$$, 'trades_exit_after_entry');
select pg_temp.check(true, 'выход раньше входа запрещён');
select pg_temp.expect_error($$insert into trades (exchange, symbol, side, entry_at, entry_price, size_usd)
  values ('bybit', 'btc usdt', 'long', now(), 1, 1)$$, 'check constraint');
select pg_temp.check(true, 'кривой тикер отклоняется');

-- Нормальная сделка + теги + скриншот
insert into trades (id, exchange, symbol, side, entry_at, exit_at, entry_price, exit_price, size_usd, leverage, fee, pnl, setup_id, emotion_id)
values ('aaaaaaaa-1111-0000-0000-000000000000', 'bybit', 'BTCUSDT', 'long', now() - interval '2 hour', now(), 60000, 61000, 6000, 10, 6, 94,
        (select id from setups order by sort_order limit 1), (select id from emotions order by sort_order limit 1));
insert into trade_mistakes (trade_id, tag_id) select 'aaaaaaaa-1111-0000-0000-000000000000', id from mistake_tags order by sort_order limit 2;
select pg_temp.check((select count(*) from trade_mistakes) = 2, 'теги ошибок привязываются');
select pg_temp.expect_error(format($$insert into trade_mistakes (trade_id, tag_id) values ('aaaaaaaa-1111-0000-0000-000000000000', %L)$$, :'b_tag'), 'foreign key');
select pg_temp.check(true, 'нельзя привязать чужой тег');
select pg_temp.expect_error($$insert into trade_mistakes (trade_id, tag_id, user_id) select 'bbbbbbbb-1111-0000-0000-000000000000', id, 'bbbbbbbb-0000-0000-0000-000000000002' from mistake_tags limit 1$$, 'row-level security|foreign key');
select pg_temp.check(true, 'нельзя повесить тег на чужую сделку');

insert into storage.objects (bucket_id, name) values ('screenshots', 'aaaaaaaa-0000-0000-0000-000000000001/aaaaaaaa-1111-0000-0000-000000000000/1.webp');
select pg_temp.expect_error($$insert into storage.objects (bucket_id, name) values ('screenshots', 'bbbbbbbb-0000-0000-0000-000000000002/bbbbbbbb-1111-0000-0000-000000000000/evil.webp')$$, 'row-level security');
select pg_temp.check(true, 'нельзя загрузить файл в папку другого пользователя');

-- Удаление сетапа не удаляет сделку
delete from setups where id = (select setup_id from trades where id = 'aaaaaaaa-1111-0000-0000-000000000000');
select pg_temp.check((select setup_id is null and user_id is not null from trades where id = 'aaaaaaaa-1111-0000-0000-000000000000'), 'удаление сетапа обнуляет ссылку, сделка остаётся');

-- Лимит Free: 30 в месяц (1 уже создана)
insert into trades (exchange, symbol, side, entry_at, entry_price, size_usd)
select 'bybit', 'SOLUSDT', 'long', now(), 150, 100 from generate_series(1, 29);
select pg_temp.check((select trades_created from get_my_usage()) = 30, 'счётчик: 30 сделок за месяц');
select pg_temp.expect_error($$insert into trades (exchange, symbol, side, entry_at, entry_price, size_usd) values ('bybit', 'SOLUSDT', 'long', now(), 150, 100)$$, 'FREE_LIMIT_REACHED');
select pg_temp.check(true, '31-я сделка на Free отклоняется');
delete from trades where symbol = 'SOLUSDT' and ctid = (select min(ctid) from trades where symbol = 'SOLUSDT');
select pg_temp.expect_error($$insert into trades (exchange, symbol, side, entry_at, entry_price, size_usd) values ('bybit', 'SOLUSDT', 'long', now(), 150, 100)$$, 'FREE_LIMIT_REACHED');
select pg_temp.check(true, 'удаление сделки не возвращает лимит');
select pg_temp.expect_error($$update usage_counters set trades_created = 0$$, 'permission denied');
select pg_temp.check(true, 'счётчик нельзя сбросить из браузера');
select pg_temp.expect_error($$select effective_plan('bbbbbbbb-0000-0000-0000-000000000002')$$, 'permission denied');
select pg_temp.check(true, 'нельзя подсмотреть тариф другого пользователя');

-- Pro (выдаёт админ)
reset role;
update profiles set plan = 'pro', plan_until = now() + interval '30 days' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
set role authenticated;
insert into trades (exchange, symbol, side, entry_at, entry_price, size_usd) values ('okx', 'SOLUSDT', 'long', now(), 150, 100);
select pg_temp.check((select trade_limit = 50 and plan = 'pro' from get_my_usage()), 'на Pro лимит 50 сделок в месяц');
insert into trades (exchange, symbol, side, entry_at, entry_price, size_usd)
select 'okx', 'SOLUSDT', 'long', now(), 150, 100 from generate_series(1, 19);
select pg_temp.check((select trades_created from get_my_usage()) = 50, 'на Pro счётчик дошёл до 50');
select pg_temp.expect_error($$insert into trades (exchange, symbol, side, entry_at, entry_price, size_usd) values ('okx', 'SOLUSDT', 'long', now(), 150, 100)$$, 'FREE_LIMIT_REACHED');
select pg_temp.check(true, '51-я сделка на Pro отклоняется');

-- Pro Plus — без лимита
reset role;
update profiles set plan = 'pro_plus', plan_until = now() + interval '30 days' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
set role authenticated;
insert into trades (exchange, symbol, side, entry_at, entry_price, size_usd) values ('okx', 'SOLUSDT', 'long', now(), 150, 100);
select pg_temp.check((select trade_limit is null and plan = 'pro_plus' from get_my_usage()), 'на Pro Plus лимита нет');

-- Импорт CSV (этап 4). Делаем на Pro Plus, чтобы не упираться в лимит.
insert into imports (id, exchange, filename, rows_total) values ('aaaaaaaa-2222-0000-0000-000000000000', 'bybit', 'closed_pnl.csv', 2);
insert into trades (exchange, symbol, side, entry_at, exit_at, entry_price, exit_price, size_usd, fee, pnl, source, import_id, external_id) values
  ('bybit', 'BTCUSDT', 'long',  now() - interval '1 hour', now(), 60000, 61000, 600,  0.66, 9.34, 'import', 'aaaaaaaa-2222-0000-0000-000000000000', 'o:a1'),
  ('bybit', 'ETHUSDT', 'short', now() - interval '1 hour', now(), 3000,  2900,  3000, 0.5,  99.5, 'import', 'aaaaaaaa-2222-0000-0000-000000000000', 'o:a2');
select pg_temp.check((select count(*) from trades where import_id = 'aaaaaaaa-2222-0000-0000-000000000000') = 2, 'импорт: сделки привязаны к записи импорта');
select trades_created as used_before from get_my_usage() \gset
select pg_temp.expect_error($$insert into trades (exchange, symbol, side, entry_at, exit_at, entry_price, exit_price, size_usd, pnl, source, external_id)
  values ('bybit', 'BTCUSDT', 'long', now() - interval '1 hour', now(), 60000, 61000, 600, 9.34, 'import', 'o:a1')$$, 'duplicate key');
select pg_temp.check((select trades_created from get_my_usage()) = :used_before, 'повторный импорт той же сделки отклоняется и не расходует лимит');
insert into trades (exchange, symbol, side, entry_at, exit_at, entry_price, exit_price, size_usd, pnl, source, external_id)
  values ('okx', 'BTCUSDT', 'long', now() - interval '1 hour', now(), 60000, 61000, 600, 10, 'import', 'o:a1');
select pg_temp.check(true, 'тот же id сделки на другой бирже — не дубль');
reset role;
insert into imports (id, user_id, exchange) values ('bbbbbbbb-2222-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000002', 'bybit');
set role authenticated;
select pg_temp.check((select count(*) from imports) = 1, 'A видит только свои импорты');
select pg_temp.expect_error($$insert into trades (exchange, symbol, side, entry_at, entry_price, size_usd, import_id)
  values ('bybit', 'BTCUSDT', 'long', now(), 1, 1, 'bbbbbbbb-2222-0000-0000-000000000000')$$, 'foreign key');
select pg_temp.check(true, 'нельзя привязать сделку к чужому импорту');
-- Отмена импорта: удалить его сделки, затем запись
delete from trades where import_id = 'aaaaaaaa-2222-0000-0000-000000000000';
delete from imports where id = 'aaaaaaaa-2222-0000-0000-000000000000';
select pg_temp.check((select count(*) from trades where source = 'import') = 1 and (select count(*) from imports) = 0, 'отмена импорта удаляет только его сделки');
reset role;
update profiles set plan_until = now() - interval '1 day' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
set role authenticated;
select pg_temp.check((select plan = 'free' from get_my_usage()), 'истёкший Pro Plus = Free');
select pg_temp.expect_error($$insert into trades (exchange, symbol, side, entry_at, entry_price, size_usd) values ('okx', 'SOLUSDT', 'long', now(), 150, 100)$$, 'FREE_LIMIT_REACHED');
select pg_temp.check(true, 'после окончания Pro снова действует лимит');

-- Аноним
set role anon;
set request.jwt.claim.sub = '';
select pg_temp.expect_error($$select * from trades$$, 'permission denied');
select pg_temp.check(true, 'аноним не имеет доступа к сделкам');
select pg_temp.expect_error($$select * from profiles$$, 'permission denied');
select pg_temp.check(true, 'аноним не имеет доступа к профилям');
select pg_temp.check((select count(*) from storage.objects) = 0, 'аноним не видит скриншоты');

-- Усиление защиты (0004)
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
set request.jwt.claims = '{"aal":"aal1"}';
select pg_temp.expect_error($$truncate trades$$, 'permission denied');
select pg_temp.check(true, 'TRUNCATE (обходит RLS) запрещён');
select pg_temp.expect_error($$insert into storage.objects (bucket_id, name) values ('screenshots', 'aaaaaaaa-0000-0000-0000-000000000001/x.webp')$$, 'row-level security');
select pg_temp.check(true, 'файл только в папку сделки {user}/{trade}/');
select pg_temp.expect_error($$insert into storage.objects (bucket_id, name) values ('screenshots', 'aaaaaaaa-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000000/x.webp')$$, 'row-level security');
select pg_temp.check(true, 'файл нельзя загрузить к несуществующей сделке');
select pg_temp.expect_error($$insert into storage.objects (bucket_id, name) values ('screenshots', 'aaaaaaaa-0000-0000-0000-000000000001/bbbbbbbb-1111-0000-0000-000000000000/x.webp')$$, 'row-level security');
select pg_temp.check(true, 'файл нельзя прикрепить к чужой сделке через свою папку');
reset role;
select id as a_trade from trades where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' order by created_at limit 1 \gset
set role authenticated;
insert into storage.objects (bucket_id, name)
select 'screenshots', 'aaaaaaaa-0000-0000-0000-000000000001/' || :'a_trade' || '/f' || g || '.webp' from generate_series(1, 20) g;
select pg_temp.expect_error(format($$insert into storage.objects (bucket_id, name) values ('screenshots', 'aaaaaaaa-0000-0000-0000-000000000001/%s/f21.webp')$$, :'a_trade'), 'row-level security');
select pg_temp.check(true, 'не больше 20 файлов на сделку');
update storage.objects set name = name || '.x' where name like 'aaaaaaaa-0000-0000-0000-000000000001/%';
reset role;
select pg_temp.check((select count(*) from storage.objects where name like '%.x') = 0, 'файлы нельзя перезаписать / переименовать');
delete from storage.objects where name like 'aaaaaaaa-0000-0000-0000-000000000001/' || :'a_trade' || '/f%';
set role authenticated;
select pg_temp.expect_error($$insert into imports (exchange) values ('../../etc')$$, 'imports_exchange_format');
select pg_temp.check(true, 'журнал импортов проверяет данные');
insert into emotions (name) select 'e' || g from generate_series(1, 92) g;
select pg_temp.expect_error($$insert into emotions (name) values ('лишняя')$$, 'ROW_LIMIT_REACHED');
select pg_temp.check(true, 'не больше 100 эмоций (и сетапов, тегов) у пользователя');
delete from emotions where name ~ '^e\d+$';
select pg_temp.expect_error($$select plan_trade_limit('free')$$, 'permission denied');
select pg_temp.check(true, 'служебные функции снаружи не вызываются');

-- 2FA: включённый второй фактор без подтверждения кодом закрывает все данные
reset role;
insert into auth.mfa_factors (user_id, status) values ('aaaaaaaa-0000-0000-0000-000000000001', 'verified');
set role authenticated;
select pg_temp.check((select count(*) from trades) = 0 and (select count(*) from profiles) = 0 and (select count(*) from setups) = 0, '2FA включена, вход без кода (aal1) — данных не видно');
select pg_temp.expect_error($$insert into setups (name) values ('взлом')$$, 'row-level security');
select pg_temp.check(true, '2FA включена, без кода — записать нельзя');
select pg_temp.expect_error($$select delete_my_account()$$, 'MFA_REQUIRED');
select pg_temp.check(true, '2FA включена, без кода — удалить аккаунт нельзя');
set request.jwt.claims = '{"aal":"aal2"}';
select pg_temp.check((select count(*) from trades) > 0 and (select count(*) from profiles) = 1, 'после подтверждения кодом (aal2) — всё доступно');
reset role;
delete from auth.mfa_factors;
set request.jwt.claims = '';

-- Несколько скриншотов на сделку (0003)
set role authenticated;
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
insert into trade_screenshots (trade_id, path) values
  ('bbbbbbbb-1111-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000002/bbbbbbbb-1111-0000-0000-000000000000/1.webp'),
  ('bbbbbbbb-1111-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000002/bbbbbbbb-1111-0000-0000-000000000000/2.webp');
select pg_temp.check((select count(*) from trade_screenshots) = 2, 'B прикрепляет несколько скриншотов к своей сделке');
select pg_temp.expect_error($$insert into trade_screenshots (trade_id, path) values ('bbbbbbbb-1111-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001/x.webp')$$, 'trade_screenshots_path_owner');
select pg_temp.check(true, 'путь скриншота должен быть в своей папке');
insert into trade_screenshots (trade_id, path)
select 'bbbbbbbb-1111-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000002/bbbbbbbb-1111-0000-0000-000000000000/n' || g || '.webp' from generate_series(3, 10) g;
select pg_temp.expect_error($$insert into trade_screenshots (trade_id, path) values ('bbbbbbbb-1111-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000002/bbbbbbbb-1111-0000-0000-000000000000/11.webp')$$, 'SCREENSHOT_LIMIT_REACHED');
select pg_temp.check(true, 'не больше 10 скриншотов на сделку');
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.check((select count(*) from trade_screenshots) = 0, 'A не видит скриншоты B');
select pg_temp.expect_error($$insert into trade_screenshots (trade_id, path) values ('bbbbbbbb-1111-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001/y.webp')$$, 'foreign key|row-level security');
select pg_temp.check(true, 'A не может прикрепить скриншот к сделке B');
delete from trade_screenshots;
reset role;
select pg_temp.check((select count(*) from trade_screenshots) = 10, 'A не может удалить скриншоты B');
delete from trades where id = 'bbbbbbbb-1111-0000-0000-000000000000';
select pg_temp.check((select count(*) from trade_screenshots) = 0, 'удаление сделки удаляет записи её скриншотов');
insert into trades (id, user_id, exchange, symbol, side, entry_at, entry_price, size_usd)
values ('bbbbbbbb-1111-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000002', 'bybit', 'ETHUSDT', 'short', now(), 3000, 500);

-- Удаление своего аккаунта (0002)
reset role;
insert into auth.users (id, email) values ('cccccccc-0000-0000-0000-000000000003', 'c@test');
set role authenticated;
set request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
insert into trades (exchange, symbol, side, entry_at, entry_price, size_usd) values ('bybit', 'BTCUSDT', 'long', now(), 1, 1);
select pg_temp.check((select count(*) from setups) = 6 and (select count(*) from trades) = 1, 'C создан со своими данными');
select delete_my_account();
reset role;
select pg_temp.check(not exists (select 1 from auth.users where id = 'cccccccc-0000-0000-0000-000000000003')
  and not exists (select 1 from profiles where id = 'cccccccc-0000-0000-0000-000000000003')
  and not exists (select 1 from trades where user_id = 'cccccccc-0000-0000-0000-000000000003')
  and not exists (select 1 from setups where user_id = 'cccccccc-0000-0000-0000-000000000003')
  and not exists (select 1 from usage_counters where user_id = 'cccccccc-0000-0000-0000-000000000003'), 'delete_my_account удаляет пользователя и все его данные');
select pg_temp.check(exists (select 1 from auth.users where id = 'bbbbbbbb-0000-0000-0000-000000000002')
  and exists (select 1 from trades where user_id = 'bbbbbbbb-0000-0000-0000-000000000002'), 'чужие данные при этом не тронуты');
set role anon;
set request.jwt.claim.sub = '';
select pg_temp.expect_error($$select delete_my_account()$$, 'permission denied');
select pg_temp.check(true, 'аноним не может вызвать delete_my_account');
set role authenticated;
select pg_temp.expect_error($$select delete_my_account()$$, 'NOT_AUTHENTICATED');
select pg_temp.check(true, 'без входа delete_my_account ничего не удаляет');
reset role;

-- Админка (0005)
reset role;
insert into admins (user_id) values ('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
select pg_temp.check(not is_admin(), 'B — не админ');
select pg_temp.expect_error($$select * from admin_list_users()$$, 'NOT_ADMIN');
select pg_temp.check(true, 'не-админ не видит список пользователей');
select pg_temp.expect_error($$select admin_set_plan('bbbbbbbb-0000-0000-0000-000000000002', 'pro', null)$$, 'NOT_ADMIN');
select pg_temp.check(true, 'не-админ не может выдать себе Pro через админку');
select pg_temp.expect_error($$select admin_reset_usage('bbbbbbbb-0000-0000-0000-000000000002')$$, 'NOT_ADMIN');
select pg_temp.check(true, 'не-админ не может сбросить лимит');
select pg_temp.expect_error($$insert into admins (user_id) values ('bbbbbbbb-0000-0000-0000-000000000002')$$, 'permission denied');
select pg_temp.check(true, 'добавить себя в админы из браузера нельзя');
select pg_temp.check((select count(*) from admins) = 0, 'B не видит список админов');

set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.check(is_admin(), 'A — админ');
select pg_temp.check((select count(*) from admins) = 1, 'админ видит только свою строку в admins');
select pg_temp.check((select count(*) from admin_list_users()) >= 2, 'админ видит всех пользователей');
select pg_temp.check((select trades_total from admin_list_users() where id = 'bbbbbbbb-0000-0000-0000-000000000002') >= 1, 'в списке видно число сделок');
select admin_set_plan('bbbbbbbb-0000-0000-0000-000000000002', 'pro', now() + interval '30 days');
select pg_temp.check((select effective_plan from admin_list_users() where id = 'bbbbbbbb-0000-0000-0000-000000000002') = 'pro', 'админ выдал Pro на 30 дней');
select admin_set_plan('bbbbbbbb-0000-0000-0000-000000000002', 'free', now());
reset role;
select pg_temp.check((select plan = 'free' and plan_until is null from profiles where id = 'bbbbbbbb-0000-0000-0000-000000000002'), 'админ снял Pro, дата очищена');
select pg_temp.check((select trades_created from usage_counters where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and month = (date_trunc('month', now() at time zone 'utc'))::date) >= 1, 'у B есть счётчик лимита');
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select admin_reset_usage('bbbbbbbb-0000-0000-0000-000000000002');
reset role;
select pg_temp.check((select trades_created from usage_counters where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and month = (date_trunc('month', now() at time zone 'utc'))::date) = 0, 'админ сбросил лимит B');

-- Выдача админки на сайте (0014)
set role authenticated;
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
select pg_temp.expect_error($$select admin_set_admin('bbbbbbbb-0000-0000-0000-000000000002', true)$$, 'NOT_ADMIN');
select pg_temp.check(true, 'не-админ не может сделать себя админом');
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.expect_error($$select admin_set_admin('aaaaaaaa-0000-0000-0000-000000000001', false)$$, 'CANNOT_REMOVE_SELF');
select pg_temp.check(true, 'админ не может снять админку с себя');
select admin_set_admin('bbbbbbbb-0000-0000-0000-000000000002', true);
select pg_temp.check((select is_admin from admin_list_users() where id = 'bbbbbbbb-0000-0000-0000-000000000002'), 'админ выдал админку B');
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
select pg_temp.check(is_admin(), 'B теперь админ');
select admin_set_admin('aaaaaaaa-0000-0000-0000-000000000001', false);
select pg_temp.check((select count(*) from admins) = 1, 'B снял админку с A');
select pg_temp.expect_error($$select admin_set_admin('bbbbbbbb-0000-0000-0000-000000000002', false)$$, 'CANNOT_REMOVE_SELF');
select pg_temp.check(true, 'последний админ не остаётся без доступа');
select admin_set_admin('aaaaaaaa-0000-0000-0000-000000000001', true);
select admin_set_admin('bbbbbbbb-0000-0000-0000-000000000002', true);
select pg_temp.expect_error($$select admin_set_admin('00000000-0000-0000-0000-000000000000', true)$$, 'USER_NOT_FOUND');
select pg_temp.check(true, 'несуществующего пользователя админом не сделать');
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select admin_set_admin('bbbbbbbb-0000-0000-0000-000000000002', false);
select pg_temp.check((select count(*) from admin_list_users() where is_admin) = 1, 'A снял админку с B — снова один админ');
reset role;
set role anon;
set request.jwt.claim.sub = '';
select pg_temp.expect_error($$select admin_set_admin('bbbbbbbb-0000-0000-0000-000000000002', true)$$, 'permission denied');
select pg_temp.check(true, 'аноним не может выдавать админку');
reset role;

-- Админ без лимитов (0009)
update profiles set plan = 'free', plan_until = null where id = 'aaaaaaaa-0000-0000-0000-000000000001';
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.check((select plan = 'pro_plus' and trade_limit is null from get_my_usage()), 'админ — всегда Pro Plus без лимита, даже если в профиле Free');
insert into trades (exchange, symbol, side, entry_at, entry_price, size_usd)
  select 'bybit', 'BTCUSDT', 'long', now(), 100, 10 from generate_series(1, 35);
select pg_temp.check(true, 'админ добавляет сделки сверх лимита Free');
insert into setups (name) select 'Сетап ' || g from generate_series(1, 100) g;
select pg_temp.check((select count(*) from setups) > 100, 'у админа нет потолка на число сетапов');
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
select pg_temp.check((select plan = 'free' and trade_limit = 30 from get_my_usage()), 'у обычного пользователя лимит Free остаётся');
reset role;

-- Админ с включённой 2FA — только после ввода кода (aal2)
insert into auth.mfa_factors (user_id, status) values ('aaaaaaaa-0000-0000-0000-000000000001', 'verified');
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.check(not is_admin(), 'админ с 2FA без кода — не админ');
select pg_temp.expect_error($$select * from admin_list_users()$$, 'NOT_ADMIN');
select pg_temp.check(true, 'без кода 2FA список пользователей закрыт');
set request.jwt.claims = '{"aal":"aal2"}';
select pg_temp.check(is_admin(), 'после кода 2FA — снова админ');
reset request.jwt.claims;
reset role;
delete from auth.mfa_factors where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';

set role anon;
set request.jwt.claim.sub = '';
select pg_temp.expect_error($$select is_admin()$$, 'permission denied');
select pg_temp.check(true, 'аноним не может вызвать функции админки');
reset role;

-- Подключения бирж (0006)
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.check(add_exchange_connection('hyperliquid', '0x1111111111111111111111111111111111111111') is not null, 'A подключил кошелёк Hyperliquid');
select pg_temp.check((select api_key from exchange_connections where exchange = 'hyperliquid') = '0x1111111111111111111111111111111111111111', 'адрес кошелька сохранён в нижнем регистре');
select pg_temp.expect_error($$select add_exchange_connection('hyperliquid', '0x123')$$, 'BAD_WALLET');
select pg_temp.check(true, 'неверный адрес кошелька отклоняется');
select pg_temp.expect_error($$select add_exchange_connection('hyperliquid', '0x1111111111111111111111111111111111111111')$$, 'CONNECTION_EXISTS');
select pg_temp.check(true, 'то же подключение дважды не добавить');
select pg_temp.expect_error($$select add_exchange_connection('ftx', 'abcdefgh12', 'secretsecret')$$, 'EXCHANGE_NOT_SUPPORTED');
select pg_temp.check(true, 'неизвестная биржа отклоняется');
select pg_temp.expect_error($$select add_exchange_connection('bybit', 'KEY12345678', null)$$, 'BAD_API_KEY');
select pg_temp.check(true, 'ключ Bybit без секрета не принимается');
select pg_temp.check(add_exchange_connection('bybit', 'KEY12345678', 'SuperSecret123', 'Основной') is not null, 'A подключил Bybit по ключу');
reset role;
select pg_temp.check((select count(*) from vault.secrets where description like 'CryptoJournal: ключ API%') = 1, 'секрет Bybit ушёл в Vault');
select pg_temp.check((select secret_id is not null from exchange_connections where exchange = 'bybit'), 'в подключении — только ссылка на секрет');
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.expect_error($$select secret_id from exchange_connections$$, 'permission denied');
select pg_temp.check(true, 'ссылку на секрет из браузера не прочитать');
select pg_temp.expect_error($$select * from vault.secrets$$, 'permission denied');
select pg_temp.check(true, 'Vault из браузера не прочитать');
select pg_temp.expect_error($$select get_connection_secret((select id from exchange_connections where exchange = 'bybit'))$$, 'permission denied');
select pg_temp.check(true, 'секрет не выдаётся даже владельцу ключа');
select pg_temp.expect_error($$insert into exchange_connections (exchange, api_key) values ('bybit', 'HACKHACKHACK')$$, 'permission denied');
select pg_temp.check(true, 'напрямую подключение не добавить (только через функцию)');
select pg_temp.expect_error($$update exchange_connections set api_key = 'X1234567'$$, 'permission denied');
select pg_temp.check(true, 'напрямую подключение не изменить');
select touch_exchange_connection((select id from exchange_connections where exchange = 'hyperliquid'), '2026-11-01T00:00:00Z', null);
select pg_temp.check((select cursor_at = '2026-11-01T00:00:00Z' and last_sync_at is not null from exchange_connections where exchange = 'hyperliquid'), 'отметка синхронизации сохраняется');

set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
select pg_temp.check((select count(*) from exchange_connections) = 0, 'B не видит подключения A');
select delete_exchange_connection((select id from exchange_connections limit 1));
select touch_exchange_connection('00000000-0000-0000-0000-000000000000', now(), 'x');
reset role;
select pg_temp.check((select count(*) from exchange_connections where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 2, 'B не может удалить подключения A');

select id as bybit_conn from exchange_connections where exchange = 'bybit' \gset
set role service_role;
select pg_temp.check(get_connection_secret(:'bybit_conn') = 'SuperSecret123', 'серверная функция (service_role) получает секрет');
reset role;

-- Синхронизация по расписанию (0007)
select pg_temp.check((select count(*) from vault.secrets where name = 'cj_sync_secret' and length(secret) = 64) = 1, 'секрет вызова sync-worker создан');
select pg_temp.check(dispatch_sync() = 0, 'без адреса проекта в Vault ничего не рассылается');
select vault.create_secret('https://proj.example.co', 'cj_project_url', 'адрес проекта');
update profiles set plan = 'pro', plan_until = null where id = 'aaaaaaaa-0000-0000-0000-000000000001';
update exchange_connections set last_sync_at = now() - interval '4 hours' where exchange = 'hyperliquid';
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select add_exchange_connection('hyperliquid', '0x3333333333333333333333333333333333333333', null, 'свежий');
select add_exchange_connection('hyperliquid', '0x4444444444444444444444444444444444444444', null, 'сломан');
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
select pg_temp.expect_error($$select add_exchange_connection('polymarket', '0x2222222222222222222222222222222222222222')$$, 'PLAN_REQUIRED');
select pg_temp.check(true, 'Basic (Free): подключения недоступны');
reset role;
update profiles set plan = 'pro', plan_until = null where id = 'bbbbbbbb-0000-0000-0000-000000000002';
set role authenticated;
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
select pg_temp.expect_error($$select add_exchange_connection('hyperliquid', '0x2222222222222222222222222222222222222222')$$, 'PLAN_REQUIRED');
select pg_temp.check(true, 'Pro: биржи (ключи API, кошельки DEX) — только на Pro Plus');
select pg_temp.expect_error($$select add_exchange_connection('bybit', 'KEYB1234567', 'SecretSecret1')$$, 'PLAN_REQUIRED');
select pg_temp.check(true, 'Pro: ключ Bybit — только на Pro Plus');
select pg_temp.check(add_exchange_connection('polymarket', '0x2222222222222222222222222222222222222222') is not null, 'Pro: Polymarket доступен');
reset role;
update exchange_connections set last_sync_at = now() - interval '10 minutes' where label in ('свежий', 'Основной');
update exchange_connections set last_error = 'KEY_INVALID | 10003' where label = 'сломан';
select id as hl_due from exchange_connections where api_key = '0x1111111111111111111111111111111111111111' \gset
select pg_temp.check(dispatch_sync() = 1, 'рассылка каждые 3 часа: только Pro Plus (не Pro), давно не обновлялось и без ошибки ключа');
select pg_temp.check((select count(*) from net.calls) = 1
  and (select url from net.calls) = 'https://proj.example.co/functions/v1/sync-worker'
  and (select body ->> 'connectionId' from net.calls) = :'hl_due'
  and (select headers ->> 'x-sync-secret' from net.calls) = (select secret from vault.secrets where name = 'cj_sync_secret'), 'задание ушло в sync-worker с секретом');

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.expect_error($$select dispatch_sync()$$, 'permission denied');
select pg_temp.check(true, 'рассылку из браузера не запустить');
select pg_temp.expect_error($$select sync_secret_ok('x')$$, 'permission denied');
select pg_temp.check(true, 'секрет вызова из браузера не проверить (не подобрать)');
select set_connection_key_expiry(:'hl_due', '2027-01-01T00:00:00Z');
select pg_temp.check((select key_expires_at = '2027-01-01T00:00:00Z' from exchange_connections where id = :'hl_due'), 'срок ключа сохраняется и виден владельцу');
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
select set_connection_key_expiry(:'hl_due', '2020-01-01T00:00:00Z');
reset role;
select pg_temp.check((select key_expires_at = '2027-01-01T00:00:00Z' from exchange_connections where id = :'hl_due'), 'B не может изменить срок ключа A');

set role anon;
set request.jwt.claim.sub = '';
select pg_temp.expect_error($$select dispatch_sync()$$, 'permission denied');
select pg_temp.check(true, 'аноним не может запустить рассылку');
reset role;

select decrypted_secret as sync_secret from vault.decrypted_secrets where name = 'cj_sync_secret' \gset
set role service_role;
select pg_temp.check(sync_secret_ok(:'sync_secret') and not sync_secret_ok('wrong') and not sync_secret_ok('') and not sync_secret_ok(null), 'sync-worker отличает верный секрет от неверного');
select pg_temp.check(effective_plan('aaaaaaaa-0000-0000-0000-000000000001') = 'pro_plus', 'sync-worker видит тариф владельца');
reset role;
update profiles set plan = 'free' where id = 'aaaaaaaa-0000-0000-0000-000000000001';

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select delete_exchange_connection((select id from exchange_connections where exchange = 'bybit'));
reset role;
select pg_temp.check((select count(*) from vault.secrets where description like 'CryptoJournal: ключ API%') = 0 and (select count(*) from exchange_connections where exchange = 'bybit') = 0, 'удаление подключения удаляет и секрет');

set role anon;
set request.jwt.claim.sub = '';
select pg_temp.expect_error($$select add_exchange_connection('hyperliquid', '0x1111111111111111111111111111111111111111')$$, 'permission denied');
select pg_temp.check(true, 'аноним не может добавить подключение');
reset role;

-- Polymarket: рынок «предсказания» (0010–0011)
set role authenticated;
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
select pg_temp.check(add_exchange_connection('polymarket', '0x5555555555555555555555555555555555555555') is not null, 'подключение Polymarket по адресу кошелька');
insert into trades (exchange, market_type, symbol, title, side, entry_at, exit_at, entry_price, exit_price, size_usd, pnl, external_id)
values ('polymarket', 'prediction', 'PM-0A1B2C3D-YES', 'Will BTC hit 150k in 2026? — Yes', 'long', now() - interval '1 day', now(), 0.42, 0, 42, -42, 'pm:test');
select pg_temp.check((select count(*) from trades where market_type = 'prediction' and exit_price = 0) = 1, 'проигравший исход: цена выхода 0 разрешена у предсказаний');
select pg_temp.expect_error($$insert into trades (exchange, symbol, side, entry_at, exit_at, entry_price, exit_price, size_usd, pnl) values ('bybit', 'BTCUSDT', 'long', now(), now(), 100, 0, 10, -10)$$, 'trades_exit_price_check');
select pg_temp.check(true, 'у фьючерсов цена выхода 0 по-прежнему запрещена');
select pg_temp.expect_error($$insert into trades (exchange, market_type, symbol, side, entry_at, entry_price, size_usd) values ('polymarket', 'prediction', 'PM-X-NO', 'short', now(), 0.5, 10)$$, 'trades_prediction_rules');
select pg_temp.check(true, 'предсказание — только покупка исхода');
select pg_temp.expect_error($$insert into trades (exchange, market_type, symbol, title, side, entry_at, entry_price, size_usd) values ('polymarket', 'prediction', 'PM-X-NO', repeat('x', 301), 'long', now(), 0.5, 10)$$, 'title');
select pg_temp.check(true, 'слишком длинное название рынка отклоняется');
reset role;

-- Удаление аккаунта чистит всё
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select add_exchange_connection('bybit', 'KEY87654321', 'AnotherSecret9');
reset role;
select pg_temp.check((select count(*) from vault.secrets where description like 'CryptoJournal: ключ API%') = 1, 'перед удалением аккаунта в Vault есть секрет A');
delete from auth.users where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.check((select count(*) from vault.secrets where description like 'CryptoJournal: ключ API%') = 0, 'удаление аккаунта удаляет и секреты API из Vault');
select pg_temp.check((select count(*) from trades where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0
  and (select count(*) from profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0, 'удаление аккаунта удаляет его данные');

\echo 'ВСЕ ТЕСТЫ БАЗЫ ПРОЙДЕНЫ'
