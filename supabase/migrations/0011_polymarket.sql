-- =====================================================================
-- 0011 — Polymarket: подключение по адресу кошелька, сделки на рынке «предсказания».
--  * сделка = закрытая позиция по исходу (Yes / No…): вход — средняя цена покупки, выход — средняя цена продажи / погашения;
--  * проигравший исход погашается по 0 — у предсказаний цена выхода может быть 0;
--  * название рынка (вопрос) хранится в trades.title, в symbol — короткий код.
-- =====================================================================

alter table public.trades add column title text check (char_length(title) <= 300);

alter table public.trades drop constraint if exists trades_exit_price_check;
alter table public.trades add constraint trades_exit_price_check
  check (exit_price > 0 or (market_type = 'prediction' and exit_price = 0));

-- предсказания: только покупка исхода, без плеча
alter table public.trades add constraint trades_prediction_rules
  check (market_type <> 'prediction' or (side = 'long' and leverage = 1));

create or replace function public.connection_kind(p_exchange text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_exchange
    when 'bybit' then 'cex'
    when 'hyperliquid' then 'wallet'
    when 'polymarket' then 'wallet'
    else null
  end;
$$;
revoke execute on function public.connection_kind(text) from public, anon;
grant  execute on function public.connection_kind(text) to authenticated;
