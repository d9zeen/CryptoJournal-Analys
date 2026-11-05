# Исследование: как устроены крипто-дневники, Polymarket и автосинхронизация каждые 3 часа

Ноябрь 2026. Источники — в конце. Сайты журналов из среды разработки напрямую не открываются,
поэтому данные — из поиска (их справка + обзоры); где источники расходятся — помечено.

---

## 1. Как работают дневники сделок (TradeZella, TradesViz, TraderSync, CoinMarketMan, Edgewonk, Tradervue)

### 1.1. Как сделки попадают в дневник

| Журнал | Как подключается крипта | Как часто тянет | Сколько истории |
|---|---|---|---|
| **TradeZella** | ключ API «только чтение» (Bybit — только с веб-версии биржи), режим «Auto Sync» | **сам каждые 3 часа**; вручную — не чаще раза в 15 минут | не указано; статус синхронизации — на странице «Add Trade» |
| **TradesViz** | ключ «только чтение» (Binance, Bybit, OKX, Coinbase, Kraken, KuCoin, Deribit, dYdX…); Hyperliquid — по адресу кошелька | **раз в сутки** (пакет после 18:00 по Нью-Йорку) + вручную | автосинхронизация тянет только недавнее: старую историю советуют загрузить файлом, потом включить авто. Hyperliquid — последние 2000 ордеров |
| **CoinMarketMan** | ключ «только чтение», «вся история в один клик»; Bybit, Binance, Bitget, Blofin, Woo, Phemex, Hyperliquid | не опубликовано | «полная история» |
| **TraderSync** | 700–950 брокеров/бирж (цифры в обзорах разные) | авто | — |
| **Edgewonk** | в основном импорт файлов; сильная аналитика | — | — |
| **Tradervue** | в основном акции/фьючерсы; про крипто-синхронизацию данных нет | — | — |
| **Koinly / KoinX** (налоги, не журналы) | Hyperliquid по адресу; Koinly — до 10 000 операций на кошелёк | по кнопке | — |

**Вывод — общий механизм у всех один:**
1. Пользователь создаёт на бирже ключ **«только чтение»** и вставляет ключ + секрет (у DEX — просто адрес кошелька).
2. Сервер журнала хранит ключ зашифрованным и **по расписанию** (TradeZella — 3 ч, TradesViz — 24 ч) скачивает новые исполнения / закрытые позиции.
3. Сделки собираются из исполнений (доливки, частичные закрытия), дубли отсекаются по id биржи.
4. Старую историю обычно догружают файлом: API бирж отдаёт ограниченную глубину.
5. Ручная кнопка «Синхронизировать» с ограничением частоты (TradeZella — 15 мин).

**Что уже есть у нас:** ключи в Vault, серверная подпись запросов (`exchange-proxy`), Bybit + Hyperliquid, дубли и лимиты,
кнопка «Обновить», синхронизация **пока сайт открыт** (при входе и раз в 15 мин). **Чего нет:** синхронизации, когда сайт закрыт (сервер по расписанию).

### 1.2. Что журналы показывают (функции)

| Функция | Кто | У нас |
|---|---|---|
| Теги: сетапы, ошибки, эмоции; заметки; скриншоты | все | ✅ |
| Дашборд: PnL, винрейт, profit factor, expectancy, R, просадка, серии | все | ✅ (Лента, кривая, просадка) |
| Календарь дней (зелёные / красные дни) | TradeZella, TradesViz | частично (период), отдельного календаря нет |
| Разбор по сетапам / парам / Long-Short / эмоциям | все | ✅ «Разбор» |
| **MAE / MFE** (насколько цена шла против / в твою сторону) + «эффективность выхода» | TradeZella, Edgewonk, TradesViz | ❌ — нужны свечи биржи по времени сделки (публичный API kline Bybit/Binance, ключ не нужен) |
| **Повтор сделки на графике** (Trade Replay) | TradeZella, TradesViz | ❌ — график свечей + точки входа/выхода (библиотека lightweight-charts) |
| Плейбуки / Strategies: правила сетапа, чек-лист, статистика по каждому | TradeZella | частично (сетапы без правил) |
| Итоговая оценка («Zella Score», «Edgewonk score» = profit factor + доходность/просадка + размер выборки) | TradeZella, Edgewonk | ❌ |
| Дневник дня (заметка на день, план / итог) | TradeZella, Edgewonk | ❌ |
| Поведенческие отчёты («после 3 убытков подряд», tilt) | Edgewonk, TradesViz | ❌ |
| Несколько счетов, ИИ-разбор, бэктест | TradeZella, TraderSync | ❌ (позже) |
| Синхронизация по API + автоматическая | TradeZella, TradesViz, CMM | ✅ API; ⬜ по расписанию |

---

## 2. Polymarket: как подтягивать сделки

- **Ключ не нужен:** Data API публичный и только для чтения, данные открыты по адресу кошелька — как у Hyperliquid.
- **Адрес:** нужен адрес **аккаунта Polymarket (proxy / deposit wallet)**, а не адрес подписи (EOA). С EOA ответ будет пустым — в подсказке объяснить, где взять адрес (профиль Polymarket).
- **API v1 выключен 2 ноября 2026** — только `/v2`:
  - `GET https://data-api.polymarket.com/v2/positions?user=<адрес>&status=CLOSED` — закрытые позиции с итогами
    (`avgPrice`, `totalBought`, `realizedPnl`, `curPrice`, `outcome`, `title`, `conditionId`, `timestamp`) — это прямо «закрытая сделка» для дневника;
  - `GET /v2/trades?user=<адрес>` — исполнения; пагинация **только курсором** (`pagination.next_cursor` → `?cursor=`), параметр `offset` даёт 400;
    без `start` — история за 3 года;
  - `GET /v2/activity?user=<адрес>` — вся активность (сделки, погашения).
- **Лимиты:** около 200 запросов / 10 с на `/v2/positions` и `/v2/activity` (данные сторонних сайтов). При перегрузке — 429 с `Retry-After`.
- **Как ложится в нашу базу:** сделка = закрытая позиция по исходу (Yes/No).
  Вход = `avgPrice`, выход = цена закрытия / погашения (1 или 0), размер = `totalBought × avgPrice`, PnL = `realizedPnl`.
  **Нужна миграция:** новый рынок `market_type = 'prediction'` и символ рынка (сейчас `symbol` — только `A-Z0-9._/-` до 30 знаков:
  хранить короткий код + полное название рынка отдельным полем). Направление — всегда «покупка исхода» (`long`).
- Адрес — в CSP (`data-api.polymarket.com`) или запросы через сервер (при синхронизации по расписанию — через сервер).

---

## 3. Автосинхронизация каждые 3 часа (только Pro)

### 3.1. Схема

```
pg_cron (каждые 3 ч, '0 */3 * * *')
   └─ SQL: выбрать подключения, которым пора (владелец — Pro, нет ошибки ключа, last_sync_at > 3 ч назад)
        └─ для КАЖДОГО подключения — свой вызов net.http_post → Edge Function `sync-worker` { connectionId }
              ├─ проверяет секрет вызова (из Vault), берёт подключение и секрет ключа (service_role)
              ├─ качает новые сделки (Bybit / Hyperliquid / Polymarket / …) с cursor_at
              ├─ отсекает дубли (existing external_id), учитывает лимит, пишет trades + запись в imports (source = 'api')
              └─ обновляет last_sync_at / cursor_at / last_error
```

- **pg_cron + pg_net + Vault** — официальный способ Supabase запускать Edge Function по расписанию (работает на бесплатном тарифе).
  В Vault хранится URL проекта и секрет вызова; функция сверяет секрет из заголовка.
- **Один вызов на подключение:** у Edge Function лимит **150 с** на бесплатном тарифе (400 с на платном), CPU 2 с, память 256 МБ.
  Один пользователь — секунды; все разом в одном вызове — не уложатся.
- **Pro / Free:** Pro — сервер каждые 3 часа + кнопка (не чаще раза в 15 мин, как в TradeZella); Free — как сейчас, только когда сайт открыт.
  Проверка тарифа — в SQL (`effective_plan(user_id) = 'pro'`), не на клиенте.
- **Нагрузка:** Bybit после первой загрузки — 2 запроса за раз (linear + inverse за последние 7 дней), Hyperliquid — 1.
  1000 Pro-подключений × 8 раз в сутки × 2 запроса ≈ 16 000 вызовов в день — в рамках бесплатных квот Supabase.

### 3.2. Что переносится на сервер

- Логика синхронизации сейчас в браузере (`src/lib/sync`, сборка сделок — `src/lib/import/fills.ts`).
  Чтобы не держать две копии: отдельная сборка (esbuild) этих же файлов в один модуль для Deno
  (`supabase/functions/_shared/sync.js`). Тесты остаются одни (Vitest).
- Вставка от имени сервера (service_role): `user_id` ставится явно; лимит Free по-прежнему проверяет триггер в базе.
  Дубли проверять **до** вставки: триггер лимита срабатывает до проверки уникальности (как и сейчас в браузере).
- Миграция: `exchange_connections` + `key_expires_at`, `next_sync_at`, `sync_error_count`; функция `due_connections()`
  (только для cron / service_role); задание `cron.schedule('cj-sync', '0 */3 * * *', …)`; `rls_test.sql` — проверки, что пользователь
  не может вызвать служебные функции и не видит чужое.

### 3.3. Ключи бирж и IP (важно для «чтобы всегда работало»)

| Биржа | Ключ без привязки к IP | Вывод |
|---|---|---|
| **Bybit** | **живёт 90 дней** (касается любых ключей, в т. ч. «только чтение»); `/v5/user/query-api` отдаёт дату окончания | сейчас: хранить `key_expires_at`, предупреждать за 7 дней. Навсегда: **привязать ключ к нашему постоянному IP** |
| **Binance** | срок связан с правом торговли; ключ «только чтение» без IP, судя по всему, не истекает (источники расходятся) | работать без IP можно, проверить на практике |
| **OKX** | удаляются через 14 дней простоя только ключи **с правом торговли / вывода** без IP; «только чтение» — не удаляются | без IP можно |

- **У Edge Functions Supabase нет постоянного IP** (официально). Supabase рекомендует **маленький сервер (VPS) с постоянным IP как прокси**
  для исходящих запросов к биржам. Тогда пользователь при создании ключа Bybit вписывает наш IP — и ключ **не истекает**.
- Этот же VPS (~3–5 $/мес) уже заложен в план для доступности из РФ (`PLAN.md`), то есть одна машина закрывает обе задачи.

### 3.4. Глубина истории по API (первая загрузка)

| Биржа | Источник | Окно запроса | Глубина |
|---|---|---|---|
| Bybit | `/v5/position/closed-pnl` | 7 дней | 2 года |
| Binance USDⓈ-M | `/fapi/v1/userTrades` (по одной паре) + `/fapi/v1/income` (фандинг) | 7 дней | **6 месяцев** |
| OKX | `/api/v5/account/positions-history` (`realizedPnl = pnl + fee + funding + …`) | — | около 3 месяцев (не подтверждено) |
| BingX | история позиций swap | — | уточнить по документации |
| Hyperliquid | `userFillsByTime` | 2000 за запрос | последние 10 000 исполнений |
| Lighter | `/api/v1/trades` по индексу аккаунта; нужен токен «только чтение» (`tokens`); CSV-выгрузка — до 12 месяцев | — | уточнить |
| Polymarket | `/v2/positions?status=CLOSED`, `/v2/trades` | курсор | 3 года (по умолчанию) |

Как у TradesViz: **старое — файлом, новое — по API.** Импорт файлов у нас уже сверен с настоящими выгрузками Bybit.

---

## 4. План работ (предложение)

1. ✅ **Сервер по расписанию для Pro** (3.1–3.2): pg_cron каждые 3 ч → `sync-worker` по одному подключению;
   срок ключа Bybit + предупреждение (сделано 05.11.2026, миграции 0007–0008).
2. **Polymarket** по адресу кошелька (миграция `prediction` + модуль `lib/sync/polymarket.ts`).
3. **Binance, OKX, BingX** по API (Binance — userTrades по парам + income; OKX — positions-history).
4. **VPS с постоянным IP** (прокси к биржам + доступ из РФ) → ключи Bybit без срока.
5. Аналитика как у лидеров: календарь дней, MAE/MFE и повтор сделки на графике (свечи с публичного API биржи), плейбуки с правилами, итоговая оценка.

---

## Источники

- TradeZella: [синхронизация Bybit](https://help.tradezella.com/en/articles/11713587-bybit-how-to-sync-your-bybit-account-with-tradezella), [Broker Sync — частота](https://help.tradezella.com/en/articles/8542897-broker-sync-same-day-trades), [функции журнала](https://www.tradezella.com/trading-journal), [Trade Replay](https://www.tradezella.com/trade-replay), [цены](https://www.tradezella.com/pricing)
- TradesViz: [синхронизация Bybit (FAQ)](https://tradesviz.crisp.help/en/article/how-to-auto-sync-trades-from-bybit-to-tradesviz-trading-journal-12r8xuo/), [автоимпорт](https://www.tradesviz.com/blog/auto-import-trades/), [Hyperliquid](https://www.tradesviz.com/blog/auto-import-hyperliquid), [крипто](https://www.tradesviz.com/cryptocurrency/)
- CoinMarketMan: [сайт](https://coinmarketman.com/), [обзор](https://bitcourier.co.uk/blog/cmm)
- Сравнения: [tradermake.money](https://tradermake.money/compare/best-crypto-trading-journal), [EdgeLedger](https://edge-ledger.io/blog/best-trading-journal-comparison-2026), [Traders Second Brain — Binance/Bybit API](https://traderssecondbrain.com/guides/binance-bybit-api-sync)
- Метрики: [Edgewonk — статистика](https://edgewonk.com/blog/a-deep-dive-into-edgewonk-performance-statistics), [Tradeciety — метрики Edgewonk](https://tradeciety.com/all-edgewonks-metrics-and-statistics-explained-for-successful-journaling)
- Polymarket: [Wallet Activity](https://docs.polymarket.com/trading/wallet-activity), [закрытые позиции](https://docs.polymarket.com/api-reference/core/get-closed-positions-for-a-user), [лимиты](https://docs.polymarket.com/api-reference/rate-limits), [v2 trades](https://docs.polymarket.com/cn/api-reference/endpoints/data-v2/get-trades.md), [гид по Data API v2](https://polymarkets.co.il/en/api/polymarket-data-api/), [лимиты v2 (сторонний)](https://www.polytest.io/blog/polymarket-api-rate-limits)
- Supabase: [расписание Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions), [лимиты Edge Functions](https://supabase.com/docs/guides/functions/limits), [нет постоянного IP](https://supabase.com/docs/guides/troubleshooting/why-supabase-edge-functions-cannot-provide-static-egress-ips-for-whitelisting-3d78b0)
- Ключи бирж: [Bybit query-api (срок ключа)](https://bybit-exchange.github.io/docs/v5/user/apikey-info), [Bybit 90 дней](https://exagg.app/en/guides/bybit-readonly-api-key/), [OKX API FAQ](https://www.okx.com/en-us/help/api-faq), [Binance userTrades](https://developers.binance.com/docs/derivatives/usds-margined-futures/trade/rest-api/Account-Trade-List)
- DEX: [Lighter — история](https://apidocs.lighter.xyz/docs/historical-data), [OKX positions-history (обёртка)](https://rdrr.io/cran/okxr/man/get_account_positions_history.html)
