-- =====================================================================
-- 0001_init.sql — базовая схема дневника сделок
--
-- Как применить: Supabase → SQL Editor → New query → вставить весь файл → Run.
-- Применять один раз. Следующие изменения — новыми файлами 0002_..., 0003_...
-- =====================================================================


-- ---------------------------------------------------------------------
-- Типы
-- ---------------------------------------------------------------------
create type public.plan_type    as enum ('free', 'pro');
create type public.market_type  as enum ('linear', 'inverse', 'spot');   -- USDT-фьючерсы / coin-margined / спот
create type public.trade_side   as enum ('long', 'short');
create type public.trade_source as enum ('manual', 'import');


-- ---------------------------------------------------------------------
-- Вспомогательные функции
-- ---------------------------------------------------------------------

-- Проверка, что строка — существующий часовой пояс (Europe/Moscow и т.п.)
create or replace function public.is_valid_timezone(tz text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  perform now() at time zone tz;
  return true;
exception when others then
  return false;
end;
$$;

-- Автообновление updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- Профиль пользователя
-- ---------------------------------------------------------------------
create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  display_name     text check (char_length(display_name) <= 60),
  plan             public.plan_type not null default 'free',
  plan_until       timestamptz,                         -- до какого числа действует Pro (null = бессрочно)
  timezone         text not null default 'UTC' check (public.is_valid_timezone(timezone)),
  starting_balance numeric(20, 2) check (starting_balance >= 0),  -- для просадки в %
  locale           text not null default 'ru' check (locale in ('ru', 'en')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- Личные справочники: сетапы, теги ошибок, эмоции
-- ---------------------------------------------------------------------
create table public.setups (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 50),
  archived   boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id)            -- нужно для составных внешних ключей ниже
);

create table public.mistake_tags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 50),
  archived   boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id)
);

create table public.emotions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 50),
  archived   boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id)
);


-- ---------------------------------------------------------------------
-- Журнал импортов CSV
-- ---------------------------------------------------------------------
create table public.imports (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  exchange      text not null,
  filename      text,
  rows_total    int not null default 0,
  rows_imported int not null default 0,
  rows_skipped  int not null default 0,
  created_at    timestamptz not null default now(),
  unique (id, user_id)
);


-- ---------------------------------------------------------------------
-- Сделки
-- ---------------------------------------------------------------------
create table public.trades (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,

  exchange        text not null check (exchange ~ '^[a-z0-9_]{2,20}$'),  -- bybit, bingx, okx, binance, other...
  market_type     public.market_type not null default 'linear',
  symbol          text not null check (symbol ~ '^[A-Z0-9._/-]{2,30}$'),  -- BTCUSDT
  side            public.trade_side not null,

  entry_at        timestamptz not null,
  exit_at         timestamptz,                         -- null = сделка открыта
  entry_price     numeric(30, 12) not null check (entry_price > 0),
  exit_price      numeric(30, 12) check (exit_price > 0),

  size_usd        numeric(24, 8) not null check (size_usd > 0),          -- номинал позиции в USD (с плечом)
  leverage        numeric(7, 2) not null default 1 check (leverage >= 1 and leverage <= 1000),
  fee             numeric(20, 8) not null default 0 check (fee >= 0),    -- все комиссии, USD
  funding         numeric(20, 8) not null default 0,                    -- + получил / − заплатил, USD
  stop_loss       numeric(30, 12) check (stop_loss > 0),
  take_profit     numeric(30, 12) check (take_profit > 0),

  pnl             numeric(20, 8),                      -- реализованный PnL в USD (только у закрытых)
  pnl_manual      boolean not null default false,      -- true = поправлен руками
  r_multiple      numeric(12, 4),

  setup_id        uuid,
  emotion_id      uuid,
  note            text check (char_length(note) <= 5000),
  screenshot_path text check (char_length(screenshot_path) <= 300),

  source          public.trade_source not null default 'manual',
  import_id       uuid,
  external_id     text check (char_length(external_id) <= 200),  -- id сделки на бирже (защита от дублей)

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (id, user_id),
  unique (user_id, exchange, external_id),

  -- выход указан целиком или не указан вовсе
  constraint trades_exit_complete     check ((exit_at is null) = (exit_price is null)),
  constraint trades_exit_after_entry  check (exit_at is null or exit_at >= entry_at),
  -- PnL есть только у закрытой сделки
  constraint trades_pnl_only_closed   check ((exit_at is null) = (pnl is null)),
  -- спот: только long, без плеча
  constraint trades_spot_rules        check (market_type <> 'spot' or (side = 'long' and leverage = 1)),

  -- справочники должны принадлежать тому же пользователю
  foreign key (setup_id, user_id)   references public.setups (id, user_id)   on delete set null (setup_id),
  foreign key (emotion_id, user_id) references public.emotions (id, user_id) on delete set null (emotion_id),
  foreign key (import_id, user_id)  references public.imports (id, user_id)  on delete set null (import_id)
);

create index trades_user_entry_idx on public.trades (user_id, entry_at desc);
create index trades_user_exit_idx  on public.trades (user_id, exit_at);
create index trades_setup_idx      on public.trades (setup_id);
create index trades_emotion_idx    on public.trades (emotion_id);
create index trades_import_idx     on public.trades (import_id);

create trigger trades_updated_at before update on public.trades
  for each row execute function public.set_updated_at();


-- Теги ошибок у сделки (многие-ко-многим)
create table public.trade_mistakes (
  trade_id uuid not null,
  tag_id   uuid not null,
  user_id  uuid not null default auth.uid(),
  primary key (trade_id, tag_id),
  foreign key (trade_id, user_id) references public.trades (id, user_id)       on delete cascade,
  foreign key (tag_id, user_id)   references public.mistake_tags (id, user_id) on delete cascade
);

create index trade_mistakes_tag_idx  on public.trade_mistakes (tag_id);
create index trade_mistakes_user_idx on public.trade_mistakes (user_id);


-- ---------------------------------------------------------------------
-- Тарифы и лимиты
-- ---------------------------------------------------------------------

-- Счётчик созданных сделок по месяцам. Удаление сделки его НЕ уменьшает.
create table public.usage_counters (
  user_id        uuid not null references auth.users (id) on delete cascade,
  month          date not null,          -- первое число месяца (UTC)
  trades_created int  not null default 0,
  primary key (user_id, month)
);

-- Действующий тариф с учётом даты окончания Pro
create or replace function public.effective_plan(uid uuid)
returns public.plan_type
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p.plan = 'pro' and (p.plan_until is null or p.plan_until > now()) then 'pro'::public.plan_type
    else 'free'::public.plan_type
  end
  from public.profiles p
  where p.id = uid;
$$;

-- Лимит сделок в месяц для тарифа (null = без лимита)
create or replace function public.plan_trade_limit(p public.plan_type)
returns int
language sql
immutable
set search_path = ''
as $$
  select case p when 'free' then 30 else null end;
$$;

-- Перед вставкой сделки: увеличить счётчик и проверить лимит.
-- Если лимит превышен — ошибка, и вся вставка (вместе со счётчиком) откатывается.
create or replace function public.enforce_trade_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m     date := (date_trunc('month', now() at time zone 'utc'))::date;
  used  int;
  lim   int := public.plan_trade_limit(coalesce(public.effective_plan(new.user_id), 'free'));
begin
  insert into public.usage_counters as uc (user_id, month, trades_created)
  values (new.user_id, m, 1)
  on conflict (user_id, month) do update set trades_created = uc.trades_created + 1
  returning uc.trades_created into used;

  if lim is not null and used > lim then
    raise exception 'FREE_LIMIT_REACHED'
      using errcode = 'P0001',
            detail  = format('Лимит тарифа Free: %s сделок в месяц', lim);
  end if;
  return new;
end;
$$;

create trigger trades_enforce_limit before insert on public.trades
  for each row execute function public.enforce_trade_limit();

-- Для интерфейса: сколько сделок создано в этом месяце и какой лимит
create or replace function public.get_my_usage()
returns table (plan public.plan_type, month date, trades_created int, trade_limit int)
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.effective_plan(auth.uid()),
    (date_trunc('month', now() at time zone 'utc'))::date,
    coalesce((select uc.trades_created from public.usage_counters uc
              where uc.user_id = auth.uid()
                and uc.month = (date_trunc('month', now() at time zone 'utc'))::date), 0),
    public.plan_trade_limit(public.effective_plan(auth.uid()));
$$;


-- ---------------------------------------------------------------------
-- Новый пользователь: профиль + готовые списки
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text := new.raw_user_meta_data ->> 'timezone';
begin
  insert into public.profiles (id, timezone)
  values (new.id, case when tz is not null and public.is_valid_timezone(tz) then tz else 'UTC' end);

  insert into public.setups (user_id, name, sort_order)
  select new.id, x.name, x.ord
  from unnest(array[
    'Пробой уровня', 'Отбой от уровня', 'Ретест', 'По тренду', 'Контртренд', 'Новости'
  ]) with ordinality as x(name, ord);

  insert into public.mistake_tags (user_id, name, sort_order)
  select new.id, x.name, x.ord
  from unnest(array[
    'FOMO', 'Ранний вход', 'Поздний вход', 'Двинул стоп', 'Без стопа',
    'Превысил риск', 'Ранний выход', 'Отыгрыш', 'Овертрейдинг', 'Не по плану'
  ]) with ordinality as x(name, ord);

  insert into public.emotions (user_id, name, sort_order)
  select new.id, x.name, x.ord
  from unnest(array[
    'Спокоен', 'Уверен', 'Сомнение', 'Страх', 'Жадность', 'Азарт', 'Скука', 'Тильт'
  ]) with ordinality as x(name, ord);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------------
-- Права доступа и Row Level Security
-- Каждый пользователь видит и меняет ТОЛЬКО свои строки.
-- ---------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.setups         enable row level security;
alter table public.mistake_tags   enable row level security;
alter table public.emotions       enable row level security;
alter table public.imports        enable row level security;
alter table public.trades         enable row level security;
alter table public.trade_mistakes enable row level security;
alter table public.usage_counters enable row level security;

-- Анонимам (не вошедшим) — ничего
revoke all on public.profiles, public.setups, public.mistake_tags, public.emotions,
              public.imports, public.trades, public.trade_mistakes, public.usage_counters
  from anon;

-- Профиль: читать свой; менять только безопасные поля (plan / plan_until — нельзя)
revoke all on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, timezone, starting_balance, locale) on public.profiles to authenticated;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Счётчик лимита: только читать свой
revoke all on public.usage_counters from authenticated;
grant select on public.usage_counters to authenticated;
create policy usage_select_own on public.usage_counters
  for select to authenticated using (user_id = (select auth.uid()));

-- Остальные таблицы: полный доступ к своим строкам
grant select, insert, update, delete on
  public.setups, public.mistake_tags, public.emotions, public.imports, public.trades, public.trade_mistakes
  to authenticated;

create policy setups_own on public.setups
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy mistake_tags_own on public.mistake_tags
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy emotions_own on public.emotions
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy imports_own on public.imports
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy trades_own on public.trades
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy trade_mistakes_own on public.trade_mistakes
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Служебные функции не вызываются напрямую из браузера
revoke execute on function public.enforce_trade_limit() from public, anon, authenticated;
revoke execute on function public.handle_new_user()     from public, anon, authenticated;
revoke execute on function public.effective_plan(uuid)  from public, anon, authenticated;
revoke execute on function public.get_my_usage()        from public, anon;
grant  execute on function public.get_my_usage()        to authenticated;


-- ---------------------------------------------------------------------
-- Хранилище скриншотов (приватное, до 2 МБ на файл)
-- Путь файла: {user_id}/{trade_id}.webp
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('screenshots', 'screenshots', false, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy screenshots_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'screenshots' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy screenshots_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'screenshots' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy screenshots_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'screenshots' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'screenshots' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy screenshots_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'screenshots' and (storage.foldername(name))[1] = (select auth.uid())::text);
