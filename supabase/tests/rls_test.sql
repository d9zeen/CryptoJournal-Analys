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
insert into storage.objects (bucket_id, name) values ('screenshots', 'bbbbbbbb-0000-0000-0000-000000000002/x.webp');

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

insert into storage.objects (bucket_id, name) values ('screenshots', 'aaaaaaaa-0000-0000-0000-000000000001/aaaaaaaa-1111-0000-0000-000000000000.webp');
select pg_temp.expect_error($$insert into storage.objects (bucket_id, name) values ('screenshots', 'bbbbbbbb-0000-0000-0000-000000000002/evil.webp')$$, 'row-level security');
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
select pg_temp.check((select trade_limit is null and plan = 'pro' from get_my_usage()), 'на Pro лимита нет');

-- Импорт CSV (этап 4). Делаем на Pro, чтобы не упираться в лимит.
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
select pg_temp.check((select plan = 'free' from get_my_usage()), 'истёкший Pro = Free');
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

-- Удаление аккаунта чистит всё
reset role;
delete from auth.users where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.check((select count(*) from trades where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0
  and (select count(*) from profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0, 'удаление аккаунта удаляет его данные');

\echo 'ВСЕ ТЕСТЫ БАЗЫ ПРОЙДЕНЫ'
