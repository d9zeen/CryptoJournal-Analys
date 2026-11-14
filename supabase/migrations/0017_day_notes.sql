-- =====================================================================
-- 0017 — Заметки дня в календаре («план / итог / настроение» — одно текстовое поле до 2000 символов).
--  * одна заметка на день у пользователя: unique (user_id, day);
--  * свои заметки видит и меняет только хозяин (RLS user_id = auth.uid()), плюс 2FA (restrictive day_notes_mfa);
--  * функция Pro Plus («Новые функции первыми», docs/PLAN.md): записать / изменить можно только на Pro Plus
--    (и админу — у него всегда Pro Plus), иначе ошибка PLAN_FEATURE. Читать и удалять свои старые заметки можно на любом тарифе;
--  * удаление аккаунта удаляет и заметки (on delete cascade).
--
-- Как применить: Supabase → SQL Editor → New query → вставить весь файл → Run. Один раз.
-- =====================================================================

create table public.day_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day        date not null,
  text       text not null default '' check (char_length(text) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, day)
);
create index day_notes_user_id_idx on public.day_notes (user_id);

create trigger day_notes_updated_at before update on public.day_notes
  for each row execute function public.set_updated_at();

alter table public.day_notes enable row level security;
create policy day_notes_select on public.day_notes for select to authenticated using (user_id = (select auth.uid()));
create policy day_notes_insert on public.day_notes for insert to authenticated with check (user_id = (select auth.uid()));
create policy day_notes_update on public.day_notes for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy day_notes_delete on public.day_notes for delete to authenticated using (user_id = (select auth.uid()));
create policy day_notes_mfa on public.day_notes
  as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

grant select, insert, update, delete on public.day_notes to authenticated;
revoke all on public.day_notes from anon;

-- Записать заметку — только Pro Plus
create or replace function public.enforce_day_note_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(public.effective_plan(new.user_id), 'free') <> 'pro_plus' then
    raise exception 'PLAN_FEATURE' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_day_note_plan() from public, anon, authenticated;

create trigger day_notes_plan
  before insert or update on public.day_notes
  for each row execute function public.enforce_day_note_plan();
