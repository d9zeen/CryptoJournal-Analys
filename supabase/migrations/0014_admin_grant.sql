-- =====================================================================
-- 0014 — Админ может выдавать и снимать админку другим (на сайте, /admin), а не только через SQL Editor.
--  * только действующий админ (is_admin: при включённой 2FA — после кода);
--  * себя снять нельзя (чтобы не остаться без доступа), последнего админа — тоже.
-- =====================================================================

create or replace function public.admin_set_admin(p_user uuid, p_admin boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user) then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_admin then
    insert into public.admins (user_id) values (p_user) on conflict (user_id) do nothing;
  else
    if p_user = auth.uid() then
      raise exception 'CANNOT_REMOVE_SELF' using errcode = 'P0001';
    end if;
    if (select count(*) from public.admins) <= 1 then
      raise exception 'LAST_ADMIN' using errcode = 'P0001';
    end if;
    delete from public.admins where user_id = p_user;
  end if;
end;
$$;
revoke execute on function public.admin_set_admin(uuid, boolean) from public, anon;
grant  execute on function public.admin_set_admin(uuid, boolean) to authenticated;
