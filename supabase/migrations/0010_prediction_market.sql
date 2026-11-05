-- 0010 — Рынок «предсказания» (Polymarket). Новое значение типа — отдельной миграцией:
-- в той же транзакции его ещё нельзя использовать (ограничения — в 0011).
alter type public.market_type add value if not exists 'prediction';
