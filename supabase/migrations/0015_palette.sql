-- =====================================================================
-- 0015 — Палитра «плюса» и «минуса» (цвета прибыли и убытка на сайте).
--  * по умолчанию у всех 'classic' — зелёный и красный;
--  * выбрать другую могут только Pro и Pro Plus (и админ): проверка триггером в базе,
--    в браузере — то же самое (полоска под календарём «Цвета плюса и минуса»);
--  * список палитр — src/lib/palette.ts и src/styles/theme.css (data-palette).
-- =====================================================================

alter table public.profiles
  add column palette text not null default 'classic'
  check (palette in ('classic', 'cyan_wine', 'teal_salmon', 'sky_coral', 'gold_indigo', 'emerald_ruby', 'aqua_tangerine', 'sage_terracotta'));

grant update (palette) on public.profiles to authenticated;

create or replace function public.enforce_palette_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.palette is distinct from old.palette
     and new.palette <> 'classic'
     and coalesce(public.effective_plan(new.id), 'free') not in ('pro', 'pro_plus') then
    raise exception 'PALETTE_NEEDS_PRO' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_palette_plan() from public, anon, authenticated;

create trigger profiles_palette_plan
  before update of palette on public.profiles
  for each row execute function public.enforce_palette_plan();
