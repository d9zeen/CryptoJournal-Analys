-- =====================================================================
-- 0003 — несколько скриншотов на сделку
--
-- Как применить: Supabase → SQL Editor → New query → вставить весь файл → Run. Один раз.
-- Файлы: Storage bucket screenshots, путь {user_id}/{trade_id}/{имя}.webp
-- (политики Storage из 0001 проверяют первую папку = user_id — подходят и сюда).
-- Старое поле trades.screenshot_path больше не используется: его значения переносятся сюда.
-- =====================================================================

create table public.trade_screenshots (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  trade_id   uuid not null,
  path       text not null check (char_length(path) between 3 and 300),
  sort_order int  not null default 0,
  created_at timestamptz not null default now(),
  unique (path),
  -- файл должен лежать в папке своего владельца
  constraint trade_screenshots_path_owner check (split_part(path, '/', 1) = user_id::text),
  foreign key (trade_id, user_id) references public.trades (id, user_id) on delete cascade
);

create index trade_screenshots_trade_user_idx on public.trade_screenshots (trade_id, user_id);
create index trade_screenshots_user_idx       on public.trade_screenshots (user_id);

-- Не больше 10 скриншотов на сделку
create or replace function public.enforce_screenshot_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.trade_screenshots where trade_id = new.trade_id) >= 10 then
    raise exception 'SCREENSHOT_LIMIT_REACHED' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger trade_screenshots_limit before insert on public.trade_screenshots
  for each row execute function public.enforce_screenshot_limit();

revoke execute on function public.enforce_screenshot_limit() from public, anon, authenticated;

-- RLS: только свои строки
alter table public.trade_screenshots enable row level security;
revoke all on public.trade_screenshots from anon;
grant select, insert, update, delete on public.trade_screenshots to authenticated;
create policy trade_screenshots_own on public.trade_screenshots
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Перенос старых одиночных скриншотов
insert into public.trade_screenshots (user_id, trade_id, path)
select user_id, id, screenshot_path from public.trades
where screenshot_path is not null and split_part(screenshot_path, '/', 1) = user_id::text
on conflict (path) do nothing;
