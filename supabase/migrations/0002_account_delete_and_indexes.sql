-- =====================================================================
-- 0002 — удаление своего аккаунта + индексы под составные внешние ключи
--
-- Как применить: Supabase → SQL Editor → New query → вставить весь файл → Run. Один раз.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Удаление своего аккаунта
-- Удаляет пользователя из auth.users; все его данные (профиль, сделки, списки,
-- импорты, счётчики) удаляются каскадом. Скриншоты в Storage браузер удаляет
-- ДО вызова через Storage API (Supabase не даёт удалять файлы SQL-запросом).
-- ---------------------------------------------------------------------
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
  delete from auth.users where id = uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant  execute on function public.delete_my_account() to authenticated;


-- ---------------------------------------------------------------------
-- Индексы: внешние ключи (x_id, user_id) должны быть покрыты индексом,
-- иначе удаление сетапа / эмоции / импорта / тега просматривает всю таблицу.
-- Одноколоночные индексы заменяем составными (они покрывают и запросы по x_id).
-- ---------------------------------------------------------------------
create index if not exists imports_user_idx               on public.imports (user_id);

create index if not exists trades_setup_user_idx          on public.trades (setup_id, user_id);
create index if not exists trades_emotion_user_idx        on public.trades (emotion_id, user_id);
create index if not exists trades_import_user_idx         on public.trades (import_id, user_id);
drop index if exists public.trades_setup_idx;
drop index if exists public.trades_emotion_idx;
drop index if exists public.trades_import_idx;

create index if not exists trade_mistakes_tag_user_idx    on public.trade_mistakes (tag_id, user_id);
create index if not exists trade_mistakes_trade_user_idx  on public.trade_mistakes (trade_id, user_id);
drop index if exists public.trade_mistakes_tag_idx;
