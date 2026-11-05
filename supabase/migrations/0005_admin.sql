-- =====================================================================
-- 0005 — Админка на сайте (/admin): список пользователей, выдать / снять Pro, сбросить лимит.
--
-- Кто админ — решает только владелец в Supabase → SQL Editor (см. docs/ADMIN.md):
--   insert into public.admins (user_id) select id from auth.users where email = '…';
-- Из браузера в таблицу admins писать нельзя никому (нет прав на insert / update / delete).
-- Все действия админки — функции security definer, каждая сначала проверяет is_admin().
-- =====================================================================

create table public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;
revoke all on public.admins from public, anon, authenticated;
grant select on public.admins to authenticated;

-- Видно только себя: так интерфейс понимает, показывать ли пункт «Админка»
create policy admins_select_self on public.admins
  for select to authenticated using (user_id = (select auth.uid()));
create policy admins_mfa on public.admins
  as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()));


-- Текущий пользователь — админ (и, если у него включена 2FA, вход подтверждён кодом)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid())
     and public.mfa_ok();
$$;
revoke execute on function public.is_admin() from public, anon;
grant  execute on function public.is_admin() to authenticated;


-- Все пользователи: email, даты, тариф, сделки в этом месяце и всего
create or replace function public.admin_list_users()
returns table (
  id              uuid,
  email           text,
  created_at      timestamptz,
  last_sign_in_at timestamptz,
  plan            public.plan_type,
  plan_until      timestamptz,
  effective_plan  public.plan_type,
  trades_month    int,
  trades_total    bigint,
  is_admin        boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  return query
    select u.id,
           u.email::text,
           u.created_at,
           u.last_sign_in_at,
           p.plan,
           p.plan_until,
           public.effective_plan(u.id),
           coalesce(uc.trades_created, 0),
           (select count(*) from public.trades t where t.user_id = u.id),
           exists (select 1 from public.admins a where a.user_id = u.id)
    from auth.users u
    join public.profiles p on p.id = u.id
    left join public.usage_counters uc
      on uc.user_id = u.id and uc.month = (date_trunc('month', now() at time zone 'utc'))::date
    order by u.created_at desc;
end;
$$;
revoke execute on function public.admin_list_users() from public, anon;
grant  execute on function public.admin_list_users() to authenticated;


-- Выдать / снять Pro. p_until = null — бессрочно (для Free игнорируется)
create or replace function public.admin_set_plan(p_user uuid, p_plan public.plan_type, p_until timestamptz default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  update public.profiles
     set plan = p_plan,
         plan_until = case when p_plan = 'pro' then p_until else null end
   where id = p_user;
  if not found then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;
revoke execute on function public.admin_set_plan(uuid, public.plan_type, timestamptz) from public, anon;
grant  execute on function public.admin_set_plan(uuid, public.plan_type, timestamptz) to authenticated;


-- Сбросить счётчик лимита Free в текущем месяце (например, после ошибочного импорта)
create or replace function public.admin_reset_usage(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  update public.usage_counters
     set trades_created = 0
   where user_id = p_user
     and month = (date_trunc('month', now() at time zone 'utc'))::date;
end;
$$;
revoke execute on function public.admin_reset_usage(uuid) from public, anon;
grant  execute on function public.admin_reset_usage(uuid) to authenticated;
