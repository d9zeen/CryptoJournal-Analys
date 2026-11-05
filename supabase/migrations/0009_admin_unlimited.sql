-- =====================================================================
-- 0009 — Админ работает без лимитов: всегда тариф Pro (без лимита сделок в месяц, синхронизация каждые 3 часа)
--        и без потолков на число записей (сетапы, теги, эмоции, импорты, сделки).
-- Админов по-прежнему назначают только в SQL Editor (таблица admins, docs/ADMIN.md).
-- =====================================================================

create or replace function public.effective_plan(uid uuid)
returns public.plan_type
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.admins a where a.user_id = uid) then 'pro'::public.plan_type
    when p.plan = 'pro' and (p.plan_until is null or p.plan_until > now()) then 'pro'::public.plan_type
    else 'free'::public.plan_type
  end
  from public.profiles p
  where p.id = uid;
$$;

create or replace function public.enforce_user_row_cap()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  cap int := tg_argv[0]::int;
  n   int;
begin
  -- админ — без потолков
  if exists (select 1 from public.admins a where a.user_id = new.user_id) then
    return new;
  end if;
  execute format('select count(*) from %I.%I where user_id = $1', tg_table_schema, tg_table_name) into n using new.user_id;
  if n >= cap then
    raise exception 'ROW_LIMIT_REACHED' using errcode = 'P0001', detail = format('%s: не больше %s', tg_table_name, cap);
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_user_row_cap() from public, anon, authenticated;
