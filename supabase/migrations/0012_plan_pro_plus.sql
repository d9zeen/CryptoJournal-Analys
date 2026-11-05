-- 0012 — Тариф Pro Plus. Новое значение типа — отдельной миграцией (в той же транзакции его ещё нельзя использовать).
alter type public.plan_type add value if not exists 'pro_plus';
