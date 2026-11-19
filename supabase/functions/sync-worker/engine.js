// СГЕНЕРИРОВАНО `npm run build:functions` из src/lib/sync/server.ts — не править руками.
// src/lib/import/csv.ts
const CANDIDATES = [
	",",
	";",
	"	"
];
/** Разделитель — тот, что чаще всего встречается в первой строке вне кавычек. */
function detectDelimiter(text) {
	const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
	let best = ",";
	let bestCount = 0;
	for (const d of CANDIDATES) {
		let count = 0;
		let quoted = false;
		for (const ch of firstLine) if (ch === "\"") quoted = !quoted;
		else if (!quoted && ch === d) count++;
		if (count > bestCount) {
			best = d;
			bestCount = count;
		}
	}
	return best;
}
function parseCsv(input) {
	const text = input.replace(/^﻿/, "");
	const delimiter = detectDelimiter(text);
	const records = [];
	let row = [];
	let field = "";
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (quoted) {
			if (ch === "\"") {
				if (text[i + 1] === "\"") {
					field += "\"";
					i++;
				} else quoted = false;
			} else field += ch;
			continue;
		}
		if (ch === "\"" && field === "") quoted = true;
		else if (ch === delimiter) {
			row.push(field);
			field = "";
		} else if (ch === "\n" || ch === "\r") {
			if (ch === "\r" && text[i + 1] === "\n") i++;
			row.push(field);
			records.push(row);
			row = [];
			field = "";
		} else field += ch;
	}
	if (field !== "" || row.length) {
		row.push(field);
		records.push(row);
	}
	const [headerRow = [], ...rows] = records.filter((r) => r.some((c) => c.trim() !== ""));
	return {
		headers: headerRow.map((h) => h.trim()),
		rows: rows.map((r) => r.map((c) => c.trim())),
		delimiter
	};
}

// src/lib/import/mapping.ts
/** Сопоставление колонок файла с полями импорта по названиям (синонимам). */
/** Заголовок → ключ для сравнения: без регистра, скобок «(UTC+0)», пробелов и знаков. */
function normalizeHeader(h) {
	return h.toLowerCase().replace(/ё/g, "е").replace(/\([^)]*\)/g, "").replace(/[^\p{L}\p{N}]/gu, "");
}
/**
* Автосопоставление: для каждого поля — первая колонка, чьё название совпадает с одним из синонимов.
* Одна колонка не может достаться двум полям (приоритет — у поля, объявленного раньше).
*/
function autoMap(headers, aliases, fuzzy = {}) {
	const norm = headers.map(normalizeHeader);
	const used = /* @__PURE__ */ new Set();
	const out = {};
	for (const field of Object.keys(aliases)) {
		const keys = aliases[field].map(normalizeHeader);
		let idx = -1;
		for (const k of keys) {
			idx = norm.findIndex((h, i) => h === k && !used.has(i));
			if (idx !== -1) break;
		}
		if (idx !== -1) used.add(idx);
		out[field] = idx;
	}
	for (const field of Object.keys(fuzzy)) {
		const rule = fuzzy[field];
		if (!rule || out[field] !== -1) continue;
		let best = -1;
		let bestScore = -Infinity;
		norm.forEach((h, i) => {
			if (used.has(i) || !rule.words.some((w) => h.includes(w))) return;
			const score = (rule.prefer.some((w) => h.includes(w)) ? 1 : 0) - (rule.avoid.some((w) => h.includes(w)) ? 2 : 0);
			if (score > bestScore) {
				best = i;
				bestScore = score;
			}
		});
		if (best !== -1) {
			used.add(best);
			out[field] = best;
		}
	}
	return out;
}

// src/lib/import/fields.ts
const FIELDS = {
	orderId: [
		"Order ID",
		"Order No",
		"Order Number",
		"OrderId",
		"Trade ID",
		"Exec ID",
		"Transaction ID",
		"ID ордера",
		"Номер ордера",
		"ID"
	],
	symbol: [
		"Contracts",
		"Contract",
		"Symbol",
		"Futures",
		"Instrument",
		"Market",
		"Trading Pair",
		"Pair",
		"Контракты",
		"Контракт",
		"Символ",
		"Торговая пара",
		"Пара",
		"Инструмент"
	],
	side: [
		"Closing Direction",
		"Close Direction",
		"Position Side",
		"Position Direction",
		"Pos. Side",
		"Direction",
		"Side",
		"Order Direction",
		"Trade Side",
		"Action",
		"Направление закрытия",
		"Направление",
		"Сторона"
	],
	qty: [
		"Closed Qty",
		"Closed Size",
		"Closed Amount",
		"Closed Quantity",
		"Close Amount",
		"Filled Qty",
		"Filled Quantity",
		"Filled Size",
		"Exec Qty",
		"Exec Quantity",
		"Executed Qty",
		"Executed Quantity",
		"Trade Qty",
		"Trade Quantity",
		"Deal Qty",
		"Qty",
		"Quantity",
		"Size",
		"Position Size",
		"Executed",
		"Filled",
		"Кол-во",
		"Количество",
		"Закрытое количество",
		"Исполненное количество",
		"Объем",
		"Объём"
	],
	entryValue: [
		"Entry Value",
		"Cum Entry Value",
		"Position Value",
		"Open Value",
		"Стоимость входа",
		"Стоимость позиции"
	],
	entryPrice: [
		"Entry Price",
		"Avg Entry Price",
		"Average Entry Price",
		"Avg. Open Price",
		"Avg Open Price",
		"Average Open Price",
		"Average Opening Price",
		"Opening Price",
		"Open Price",
		"Цена входа",
		"Средняя цена входа",
		"Цена открытия"
	],
	exitPrice: [
		"Exit Price",
		"Avg Exit Price",
		"Average Exit Price",
		"Avg. Close Price",
		"Avg Close Price",
		"Average Close Price",
		"Average Closing Price",
		"Closing Price",
		"Close Price",
		"Цена выхода",
		"Средняя цена выхода",
		"Цена закрытия"
	],
	price: [
		"Price",
		"Filled Price",
		"Fill Price",
		"Exec Price",
		"Trade Price",
		"Avg. Price",
		"Avg Price",
		"Average Price",
		"Deal Price",
		"Цена",
		"Цена исполнения"
	],
	value: [
		"Exec Value",
		"Filled Value",
		"Executed Value",
		"Trade Value",
		"Deal Value",
		"Amount",
		"Value",
		"Total",
		"Turnover",
		"Сумма",
		"Сумма исполнения"
	],
	pnl: [
		"Closed P&L",
		"Closed PnL",
		"Realized Profit",
		"Realized P&L",
		"Realized PnL",
		"Realised P&L",
		"Realised PnL",
		"Net PnL",
		"P&L",
		"PnL",
		"Profit",
		"Закрытый P&L",
		"Закрытые P&L",
		"Закрытый PnL",
		"Реализованный P&L",
		"Реализованный PnL",
		"Прибыль/убыток"
	],
	openFee: [
		"Opening Fee",
		"Open Fee",
		"Opening Fees",
		"Комиссия за открытие"
	],
	closeFee: [
		"Closing Fee",
		"Close Fee",
		"Closing Fees",
		"Комиссия за закрытие"
	],
	fee: [
		"Trading Fee",
		"Trading Fees",
		"Exec Fee",
		"Fee",
		"Fees",
		"Total Fee",
		"Commission",
		"Комиссия",
		"Комиссии",
		"Торговая комиссия"
	],
	feeCoin: [
		"Fee Coin",
		"Fee Currency",
		"Fee Asset",
		"Fee Unit",
		"Commission Asset",
		"Валюта комиссии"
	],
	funding: [
		"Funding Fee",
		"Funding",
		"Funding Fees",
		"Фандинг",
		"Комиссия за финансирование",
		"Ставка финансирования"
	],
	rowType: [
		"Filled Type",
		"Fill Type",
		"Exec Type",
		"Execution Type",
		"Transaction Type",
		"Тип исполнения"
	],
	orderPrice: ["Order Price", "Цена ордера"],
	sideHint: [
		"Open/Close",
		"Open Close",
		"Trade Type",
		"Position Effect",
		"Effect",
		"Action Type",
		"Type",
		"Тип сделки",
		"Открытие/Закрытие"
	],
	leverage: [
		"Leverage",
		"Плечо",
		"Кредитное плечо"
	],
	openTime: [
		"Open Time",
		"Opening Time",
		"Opened Time",
		"Time Opened",
		"Opened",
		"Entry Time",
		"Время открытия",
		"Время входа"
	],
	closeTime: [
		"Trade Time",
		"Close Time",
		"Closing Time",
		"Closed Time",
		"Time Closed",
		"Closed",
		"Exit Time",
		"Exec Time",
		"Date(UTC)",
		"Time",
		"Updated Time",
		"Created Time",
		"Transaction Time",
		"Date",
		"Время сделки",
		"Время закрытия",
		"Время исполнения",
		"Время",
		"Дата"
	]
};
/**
* Запасной поиск, если точного названия нет: колонка, в названии которой есть такое слово
* (биржи часто меняют заголовки: «Filled Quantity», «Qty(BTC)», «Exec. Qty / Contracts»).
* prefer — слова, которые делают колонку предпочтительнее (исполненный объём, а не объём ордера), avoid — наоборот.
*/
const FUZZY = {
	qty: {
		words: [
			"qty",
			"quantity",
			"size",
			"volume",
			"количество",
			"колво",
			"объем"
		],
		prefer: [
			"fill",
			"exec",
			"trade",
			"deal",
			"closed",
			"исполн"
		],
		avoid: [
			"order",
			"leaves",
			"remain",
			"cancel",
			"ордер"
		]
	},
	value: {
		words: [
			"value",
			"turnover",
			"notional",
			"стоимость",
			"сумма"
		],
		prefer: [
			"fill",
			"exec",
			"trade",
			"deal",
			"исполн"
		],
		avoid: [
			"order",
			"entry",
			"position",
			"ордер"
		]
	}
};
/** Валюты, комиссия в которых уже в долларах */
const USD_COINS = /* @__PURE__ */ new Set([
	"USDT",
	"USDC",
	"USD",
	"BUSD",
	"FDUSD",
	"TUSD",
	"USDE",
	"DAI"
]);
/** Убираем хвосты бессрочных контрактов: BTC-USDT-SWAP → BTC-USDT, BTCPERP → BTC */
function core(symbol) {
	return symbol.replace(/[-_]?(SWAP|PERPETUAL|PERP)$/, "");
}
/** BTCUSD, BTC-USD-SWAP, BTCUSDZ26 — инверсные (coin-M); остальное — USDT/USDC (linear). */
function marketOf(symbol) {
	const s = core(symbol);
	return /USD$/.test(s) || /USD[FGHJKMNQUVXZ]\d{2}$/.test(s) || /-USD-\d{6}$/.test(s) ? "inverse" : "linear";
}
/** «BTCUSDT Perpetual», «btc-usdt» → BTCUSDT / BTC-USDT; null — если не похоже на пару. */
function normalizeSymbol(raw) {
	const s = (raw ?? "").trim().split(/\s+/)[0]?.toUpperCase() ?? "";
	return /^[A-Z0-9._/-]{2,30}$/.test(s) ? s : null;
}
/**
* Направление ПОЗИЦИИ из колонки направления.
* «Long/Short/Лонг/Шорт» — понятно и так. Buy/Sell: при meaning='closing' это закрывающий ордер
* (Sell закрывает лонг — Bybit Closed P&L), при 'opening' — открывающий (Buy = long).
*/
function positionSide(raw, meaning = "closing") {
	const s = (raw ?? "").trim().toLowerCase();
	if (/long|лонг/.test(s)) return "long";
	if (/short|шорт/.test(s)) return "short";
	const buy = /buy|покупк|купить|^b$/.test(s);
	const sell = /sell|продаж|продать|^s$/.test(s);
	if (!buy && !sell) return null;
	if (meaning === "closing") return sell ? "long" : "short";
	return buy ? "long" : "short";
}
/** Если заголовок колонки говорит сам за себя — он важнее настройки биржи */
function sideMeaningFromHeader(header, fallback) {
	const h = (header ?? "").toLowerCase();
	if (/clos|закр/.test(h)) return "closing";
	if (/position|позиц|open|откр/.test(h)) return "opening";
	return fallback;
}
/** Просто «Long» / «Short» (без открытия / закрытия) → +1 / −1, иначе null */
function bareSide(raw) {
	const s = (raw ?? "").trim().toLowerCase();
	if (/^(long|лонг|多)$/.test(s)) return 1;
	if (/^(short|шорт|空)$/.test(s)) return -1;
	return null;
}
/** Знак исполнения в истории сделок: +1 — покупка (растит лонг / закрывает шорт), −1 — продажа. */
function fillSign(raw) {
	const s = (raw ?? "").trim().toLowerCase().replace(/[_\-/\s]+/g, " ");
	if (!s) return null;
	if (/开多|平空/.test(s)) return 1;
	if (/开空|平多/.test(s)) return -1;
	const long = /long|лонг|^l$/.test(s);
	const short = /short|шорт/.test(s);
	const open = /open|откр|^o\b|\bo$/.test(s);
	const close = /clos|закр|^c\b|\bc$/.test(s);
	if (long && open) return 1;
	if (long && close) return -1;
	if (short && open) return -1;
	if (short && close) return 1;
	if (/buy|bid|покупк|купить|куплено|^b$|^bo$|^bc$|买/.test(s)) return 1;
	if (/sell|ask|продаж|продать|продано|^s$|^so$|^sc$|卖/.test(s)) return -1;
	return null;
}
/** Валюта комиссии: из отдельной колонки или из хвоста значения («0.0001BNB») */
function feeCoinOf(feeCell, coinCell) {
	const c = (coinCell ?? "").trim().toUpperCase();
	if (c) return c;
	const m = /([A-Za-z]{2,10})\s*$/.exec(feeCell ?? "");
	return m ? m[1].toUpperCase() : null;
}
/**
* Комиссия → USD. Валюта-доллар — как есть; базовая монета пары (BTC у BTCUSDT, BTC у BTCUSD) — × цену;
* посторонняя монета (BNB и т.п.) — перевести нельзя: null.
*/
function feeToUsd(amount, coin, symbol, price, market) {
	const a = Math.abs(amount);
	if (!coin) return market === "inverse" ? a * price : a;
	if (USD_COINS.has(coin)) return a;
	if (symbol.startsWith(coin)) return a * price;
	return null;
}

// src/lib/import/values.ts
/** Разбор значений из ячеек CSV: числа в разных форматах, даты, смещение часового пояса. */
/**
* Число из ячейки: «1234.5», «1,234.50», «1 234,5», «-0.012 USDT», «+12%».
* Пусто, «--», «N/A» → null.
*/
function parseNumberCell(raw) {
	if (raw === void 0) return null;
	let s = raw.trim().replace(/[\s  ]/g, "");
	if (s === "" || /^(-+|n\/?a|null|none|—)$/i.test(s)) return null;
	s = s.replace(/\u2212/g, "-");
	s = s.replace(/^[^\d+\-.,]+|[^\d.,]+$/g, "");
	s = s.replace(/^\+/, "");
	const lastDot = s.lastIndexOf(".");
	const lastComma = s.lastIndexOf(",");
	if (lastDot !== -1 && lastComma !== -1) s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
	else if (lastComma !== -1) s = /^-?\d{1,3}(,\d{3})+$/.test(s) && !/^-?0,/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
	if (!/^-?\d*\.?\d+(e[-+]?\d+)?$/i.test(s)) return null;
	const n = Number(s);
	return Number.isFinite(n) ? n : null;
}
/** Смещение из заголовка вида «Trade Time(UTC+3)» / «UTC-05:30», в минутах. null — не указано. */
function offsetFromHeader(header) {
	const m = /UTC\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?/i.exec(header);
	if (!m) return /\bUTC\b/i.test(header) ? 0 : null;
	const minutes = Number(m[2]) * 60 + Number(m[3] ?? 0);
	return m[1] === "-" ? -minutes : minutes;
}
/**
* Дата/время из ячейки → ISO (UTC).
* Понимает: 2026-11-03 14:05[:06], 2026/11/03 14:05, 03.11.2026 14:05, 11/03/2026 14:05 (м/д/г),
* ISO с «Z» или смещением, unix-время в секундах и миллисекундах.
* offsetMinutes — пояс, в котором записано время без явного смещения (UTC+3 → 180).
*/
function parseDateCell(raw, offsetMinutes = 0) {
	if (!raw) return null;
	const s = raw.trim();
	if (s === "") return null;
	if (/^\d{10}(\d{3})?$/.test(s)) {
		const ms = s.length === 13 ? Number(s) : Number(s) * 1e3;
		return new Date(ms).toISOString();
	}
	if (/T.*(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
		const d = new Date(s);
		return Number.isNaN(d.getTime()) ? null : d.toISOString();
	}
	let y, mo, d;
	let rest;
	let m;
	const timeFirst = /^(\d{1,2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:\s*[AP]M)?)\s+(\S+)$/i.exec(s);
	if (timeFirst) return parseDateCell(`${timeFirst[2]} ${timeFirst[1]}`, offsetMinutes);
	if (m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(.*)$/.exec(s)) [y, mo, d, rest] = [
		Number(m[1]),
		Number(m[2]),
		Number(m[3]),
		m[4]
	];
	else if (m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(.*)$/.exec(s)) [d, mo, y, rest] = [
		Number(m[1]),
		Number(m[2]),
		Number(m[3]),
		m[4]
	];
	else if (m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(.*)$/.exec(s)) {
		const a = Number(m[1]);
		const b = Number(m[2]);
		[d, mo] = a > 12 ? [a, b] : [b, a];
		y = Number(m[3]);
		rest = m[4];
	} else return null;
	const t = /^[T\s,]*(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?\s*(AM|PM)?\s*$/i.exec(rest);
	if (rest.trim() !== "" && !t) return null;
	let hh = t ? Number(t[1]) : 0;
	const mm = t ? Number(t[2]) : 0;
	const ss = t?.[3] ? Number(t[3]) : 0;
	const msec = t?.[4] ? Number(t[4].padEnd(3, "0")) : 0;
	const ampm = t?.[5]?.toUpperCase();
	if (ampm === "PM" && hh < 12) hh += 12;
	if (ampm === "AM" && hh === 12) hh = 0;
	if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mm > 59 || ss > 59) return null;
	const utc = Date.UTC(y, mo - 1, d, hh, mm, ss, msec) - offsetMinutes * 6e4;
	if (new Date(Date.UTC(y, mo - 1, d)).getUTCDate() !== d) return null;
	return new Date(utc).toISOString();
}
/** Короткий стабильный хэш строки (FNV-1a 32 бита ×2) — для id строк без Order ID. */
function stableHash(s) {
	let h1 = 2166136261;
	let h2 = 16777619;
	for (let i = 0; i < s.length; i++) {
		const c = s.charCodeAt(i);
		h1 = Math.imul(h1 ^ c, 16777619);
		h2 = Math.imul(h2 ^ c, 1540483477);
	}
	return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}

// src/lib/import/plan.ts
/** Подготовка импорта: файл → строки → что вставляем, что пропускаем и почему. */
/** Разобрать текст файла. mapping / offset — ручные поправки пользователя (иначе автоопределение). */
function prepareImport(source, parser, overrides = {}) {
	const table = typeof source === "string" ? parseCsv(source) : source;
	const auto = !overrides.mapping;
	let mapping = overrides.mapping ?? autoMap(table.headers, parser.fields, FUZZY);
	if (auto && parser.mode(mapping) === "fills") mapping = repairSide(table, mapping);
	if (auto && parser.mode(mapping) === "positions" && mapping.side < 0 && (mapping.sideHint ?? -1) >= 0) mapping = {
		...mapping,
		side: mapping.sideHint,
		sideHint: -1
	};
	const timeCol = mapping[parser.timeField];
	const fromHeader = timeCol >= 0 ? offsetFromHeader(table.headers[timeCol]) : null;
	const utcOffsetMinutes = overrides.utcOffsetMinutes ?? fromHeader ?? 0;
	const missing = parser.missing(mapping);
	const mode = parser.mode(mapping);
	const base = {
		utcOffsetMinutes,
		market: overrides.market ?? "auto"
	};
	let rows = missing.length ? [] : parser.parse(table, mapping, base);
	let sideFallback = null;
	if (mode === "fills" && rows.length) {
		if (rows.filter((r) => r.error === "side").length > rows.length / 2) {
			let best = {
				trades: 0,
				open: Infinity
			};
			let fallbackRows = null;
			const vote = longIsBuyVote(table, mapping);
			const order = vote !== null && vote >= .95 ? ["longIsBuy"] : mapping.pnl >= 0 ? [
				"positionSide",
				"qtySign",
				"longIsBuy"
			] : [
				"qtySign",
				"longIsBuy",
				"positionSide"
			];
			for (const fb of order) {
				const tryRows = parser.parse(table, mapping, {
					...base,
					sideFallback: fb
				});
				if (tryRows.filter((r) => r.error === "side").length > tryRows.length * .1) continue;
				const trades = tryRows.filter((r) => r.trade).length;
				const open = tryRows.filter((r) => r.error === "stillOpen").length;
				if (trades > 0 && (trades >= open * 2 || order.length === 1) && trades > best.trades) {
					best = {
						trades,
						open
					};
					rows = tryRows;
					sideFallback = fb;
					if (fb === "positionSide") break;
				}
				if (fb === "positionSide") fallbackRows = tryRows;
			}
			if (!sideFallback && fallbackRows) {
				rows = fallbackRows;
				sideFallback = "positionSide";
			}
		}
	}
	return {
		table,
		mapping,
		utcOffsetMinutes,
		offsetDetected: fromHeader !== null,
		missing,
		mode,
		rows,
		sideFallback
	};
}
/**
* Доля исполнений, где «Long» / «Short» совпадает с покупкой / продажей по цене ордера
* (покупка: цена ордера выше цены исполнения — защита рыночного ордера или лимит, исполненный не хуже).
* null — сравнить не по чему.
*/
function longIsBuyVote(table, mapping) {
	if (mapping.orderPrice < 0 || mapping.price < 0 || mapping.side < 0) return null;
	let agree = 0;
	let total = 0;
	for (const row of table.rows) {
		const dir = bareSide(row[mapping.side]);
		const order = parseNumberCell(row[mapping.orderPrice]);
		const fill = parseNumberCell(row[mapping.price]);
		if (!dir || !order || !fill || order <= 0 || order === fill) continue;
		total++;
		if ((order > fill ? 1 : -1) === dir) agree++;
	}
	return total >= 5 ? agree / total : null;
}
/**
* Направление в истории исполнений: если в найденной колонке значения непонятны,
* ищем другую колонку, где они читаются (Buy / Sell), или колонку-подсказку
* «открытие / закрытие», которая вместе с ней даёт направление («Long» + «Open»).
*/
function repairSide(table, mapping) {
	const sample = table.rows.slice(0, 300).filter((r) => r.some((c) => c.trim() !== ""));
	if (!sample.length) return mapping;
	const rate = (text) => sample.filter((r) => fillSign(text(r)) !== null).length / sample.length;
	const at = (row, i) => i >= 0 ? row[i] ?? "" : "";
	const s = mapping.side;
	const h = mapping.sideHint ?? -1;
	const current = (row) => fillSign(at(row, s)) !== null ? at(row, s) : `${at(row, s)} ${at(row, h)}`;
	if (s >= 0 && rate(current) >= .9) return mapping;
	const taken = new Set(Object.entries(mapping).filter(([f, i]) => i >= 0 && f !== "side" && f !== "sideHint").map(([, i]) => i));
	const cols = table.headers.map((_, i) => i).filter((i) => !taken.has(i) && i !== s);
	for (const c of cols) if (rate((r) => at(r, c)) >= .9) return {
		...mapping,
		side: c,
		sideHint: -1
	};
	if (s >= 0) {
		for (const c of cols) if (rate((r) => `${at(r, s)} ${at(r, c)}`) >= .9) return {
			...mapping,
			sideHint: c
		};
	}
	return mapping;
}
/**
* existingIds — external_id сделок этой биржи, которые уже есть у пользователя.
* remaining — сколько ещё сделок можно создать в этом месяце (null — без лимита).
* Если всё не влезает в лимит, берём самые старые: так история заполняется без дыр.
*/
function planImport(rows, existingIds, remaining) {
	const status = /* @__PURE__ */ new Map();
	const fresh = [];
	rows.forEach((r, i) => {
		if (!r.trade) status.set(i, "error");
		else if (existingIds.has(r.trade.external_id)) status.set(i, "duplicate");
		else fresh.push({
			r,
			i
		});
	});
	fresh.sort((a, b) => a.r.trade.exit_at.localeCompare(b.r.trade.exit_at) || a.r.line - b.r.line);
	const cap = remaining === null ? fresh.length : Math.max(0, remaining);
	fresh.forEach(({ i }, k) => status.set(i, k < cap ? "new" : "overLimit"));
	const counts = {
		new: 0,
		duplicate: 0,
		error: 0,
		overLimit: 0
	};
	for (const s of status.values()) counts[s]++;
	return {
		toInsert: fresh.slice(0, cap).map(({ r }) => r.trade),
		status,
		counts
	};
}

// src/lib/calc/trade.ts
const dir = (side) => side === "long" ? 1 : -1;
const valid = (n) => typeof n === "number" && Number.isFinite(n) && n > 0;
/** PnL инверсного контракта в монете (например, в BTC для BTCUSD). */
function inversePnlCoin(t) {
	if (!valid(t.entryPrice) || !valid(t.exitPrice) || !valid(t.sizeUsd)) return null;
	return dir(t.side) * t.sizeUsd * (1 / t.entryPrice - 1 / t.exitPrice);
}
/** Валовый PnL до комиссий и фандинга, USD. null — если сделка не закрыта или не хватает данных. */
function grossPnl(t) {
	const exit = t.exitPrice;
	const exitOk = typeof exit === "number" && Number.isFinite(exit) && (exit > 0 || t.marketType === "prediction" && exit === 0);
	if (!valid(t.entryPrice) || !exitOk || !valid(t.sizeUsd)) return null;
	if (t.marketType === "inverse") return inversePnlCoin(t) * exit;
	const qty = t.sizeUsd / t.entryPrice;
	return dir(t.side) * (exit - t.entryPrice) * qty;
}
/** Округление для сохранения в базу. */
function round(n, digits = 8) {
	const f = 10 ** digits;
	return Math.round(n * f) / f;
}

// src/lib/sync/bybit.ts
/**
* Bybit API v5 → сделки. Источник — /v5/position/closed-pnl (закрытые позиции, как отчёт «Закрытый P&L»):
* одна запись = одна закрытая позиция с ценами входа / выхода и PnL от биржи (уже за вычетом комиссий и фандинга).
* Запросы подписывает серверная функция exchange-proxy (секрет в браузер не попадает).
*/
const num$2 = (s) => s === void 0 || s === "" ? null : Number(s);
/** Одна закрытая позиция Bybit → сделка для дневника (null — если данные неполные) */
function bybitClosedToTrade(item, category) {
	const symbol = normalizeSymbol(item.symbol);
	const entry = num$2(item.avgEntryPrice);
	const exit = num$2(item.avgExitPrice);
	const pnlRaw = num$2(item.closedPnl);
	const time = num$2(item.updatedTime) ?? num$2(item.createdTime);
	if (!symbol || !entry || !exit || entry <= 0 || exit <= 0 || pnlRaw === null || !time) return null;
	const side = item.side === "Sell" ? "long" : "short";
	const market = category;
	const size = market === "inverse" ? num$2(item.closedSize) : num$2(item.cumEntryValue);
	if (!size || size <= 0) return null;
	const toUsd = (v) => market === "inverse" ? v * exit : v;
	const pnl = round(toUsd(pnlRaw), 8);
	const gross = grossPnl({
		marketType: market,
		side,
		entryPrice: entry,
		exitPrice: exit,
		sizeUsd: size
	}) ?? 0;
	let fee;
	let funding;
	const openFee = num$2(item.openFee);
	const closeFee = num$2(item.closeFee);
	if (openFee !== null && closeFee !== null) {
		fee = round(toUsd(Math.abs(openFee) + Math.abs(closeFee)), 8);
		funding = round(pnl - (gross - fee), 8);
	} else {
		const diff = round(gross - pnl, 8);
		fee = diff > 0 ? diff : 0;
		funding = diff > 0 ? 0 : -diff;
	}
	const at = new Date(time).toISOString();
	const lev = num$2(item.leverage) ?? 1;
	return {
		exchange: "bybit",
		market_type: market,
		symbol,
		side,
		entry_at: at,
		exit_at: at,
		entry_price: entry,
		exit_price: exit,
		size_usd: round(size, 8),
		leverage: Math.min(1e3, Math.max(1, lev)),
		fee,
		funding,
		pnl,
		pnl_manual: false,
		external_id: `o:${item.orderId}`
	};
}
const DAY$1 = 864e5;
const WINDOW$1 = 7 * DAY$1;
var BybitError = class extends Error {
	code;
	constructor(code, message) {
		super(message);
		this.code = code;
	}
};
/** Все закрытые позиции с from по to (мс): окна по 7 дней, страницы по 100, linear и inverse */
async function fetchBybitTrades(call, from, to, onProgress) {
	const windows = [];
	for (let s = from; s < to; s += WINDOW$1) windows.push([s, Math.min(s + WINDOW$1 - 1, to)]);
	const jobs = ["linear", "inverse"].flatMap((category) => windows.map((w) => ({
		category,
		w
	})));
	const out = [];
	let done = 0;
	const PARALLEL = 4;
	for (let i = 0; i < jobs.length; i += PARALLEL) await Promise.all(jobs.slice(i, i + PARALLEL).map(async ({ category, w }) => {
		let cursor = "";
		for (let page = 0; page < 50; page++) {
			const res = await call("/v5/position/closed-pnl", {
				category,
				startTime: w[0],
				endTime: w[1],
				limit: 100,
				...cursor ? { cursor } : {}
			});
			if (res.retCode !== 0) throw new BybitError(res.retCode, res.retMsg);
			const r = res.result;
			for (const item of r.list ?? []) {
				const t = bybitClosedToTrade(item, category);
				if (t) out.push(t);
			}
			cursor = r.nextPageCursor ?? "";
			if (!cursor || !(r.list ?? []).length) break;
		}
		onProgress?.(++done, jobs.length);
	}));
	return out;
}
/** Проверка ключа: только чтение. Возвращает дату окончания ключа (Bybit: без привязки к IP — 90 дней) */
async function checkBybitKey(call) {
	const res = await call("/v5/user/query-api", {});
	if (res.retCode !== 0) throw new BybitError(res.retCode, res.retMsg);
	const r = res.result;
	return {
		readOnly: r.readOnly === 1,
		expiresAt: r.expiredAt || null
	};
}

// src/lib/import/pnl.ts
/**
* Итоговый PnL при импорте. Биржи пишут PnL по-разному: одни уже за вычетом комиссий
* (Bybit Closed P&L), другие — до комиссий (Binance «Realized Profit»). Определяем по тому,
* к чему ближе число из файла: к валовому PnL или к PnL после комиссий.
*/
function finalPnl(a) {
	const computed = a.gross - a.fee + a.funding;
	if (a.filePnl === null) return {
		pnl: computed,
		pnlManual: false
	};
	const pnl = a.fee > 0 && Math.abs(a.filePnl - a.gross) < Math.abs(a.filePnl - (a.gross - a.fee)) ? a.filePnl - a.fee + a.funding : a.filePnl;
	return {
		pnl,
		pnlManual: Math.abs(pnl - computed) > Math.max(.01, a.sizeUsd * 5e-4)
	};
}

// src/lib/import/positions.ts
/**
* Закрытые позиции: одна строка = одна закрытая позиция
* (Bybit Closed P&L, OKX / BingX / Bitget Position History и похожие).
*/
/**
* Направления в файле нет: какая версия — лонг или шорт — даёт PnL, ближе всего к PnL из файла.
* grossLong — валовый PnL, если бы это был лонг (у шорта — тот же с минусом).
*/
function sideFromPnl(grossLong, pnl, fees) {
	if (pnl === null || grossLong === 0) return null;
	return Math.abs(grossLong - fees - pnl) <= Math.abs(-grossLong - fees - pnl) ? "long" : "short";
}
function parsePositions(table, mapping, { utcOffsetMinutes, market: marketChoice }, exchange, sideMeaning) {
	const seen = /* @__PURE__ */ new Map();
	const has = (f) => mapping[f] >= 0;
	return table.rows.map((row, i) => {
		const line = i + 2;
		const cell = (f) => has(f) ? row[mapping[f]] : void 0;
		const n = (f) => parseNumberCell(cell(f));
		const fail = (error, detail) => ({
			line,
			trade: null,
			error,
			detail,
			warnings: []
		});
		const warnings = [];
		const symbol = normalizeSymbol(cell("symbol"));
		if (!symbol) return fail("symbol");
		const entryPrice = n("entryPrice");
		if (entryPrice === null || entryPrice <= 0) return fail("entryPrice");
		const exitPrice = n("exitPrice");
		if (exitPrice === null || exitPrice <= 0) return fail("exitPrice");
		const market = marketChoice === "auto" ? marketOf(symbol) : marketChoice;
		const coinToUsd = market === "inverse" ? exitPrice : 1;
		const qty = n("qty");
		const entryValue = n("entryValue");
		const sizeUsd = market === "inverse" ? Math.abs(qty ?? entryValue ?? 0) : entryValue !== null && entryValue !== 0 ? Math.abs(entryValue) : Math.abs(qty ?? 0) * entryPrice;
		if (!(sizeUsd > 0)) return fail("size");
		const feesRaw = Math.abs(n("openFee") ?? 0) + Math.abs(n("closeFee") ?? 0) + (has("openFee") || has("closeFee") ? 0 : Math.abs(n("fee") ?? 0));
		const pnlForSide = n("pnl");
		const side = positionSide(cell("side"), sideMeaning) ?? sideFromPnl(grossPnl({
			marketType: market,
			side: "long",
			entryPrice,
			exitPrice,
			sizeUsd
		}), pnlForSide === null ? null : pnlForSide * coinToUsd, feesRaw * coinToUsd);
		if (!side) return fail("side", cell("side"));
		if (market === "spot" && side === "short") return fail("side");
		const exitAt = parseDateCell(cell("closeTime"), utcOffsetMinutes);
		if (!exitAt) return fail("time");
		let entryAt = exitAt;
		if (has("openTime")) {
			const parsed = parseDateCell(cell("openTime"), utcOffsetMinutes);
			if (!parsed) return fail("time");
			entryAt = parsed;
		} else warnings.push("noEntryTime");
		if (entryAt > exitAt) return fail("time");
		const funding = (n("funding") ?? 0) * coinToUsd;
		const pnlFile = n("pnl");
		const gross = grossPnl({
			marketType: market,
			side,
			entryPrice,
			exitPrice,
			sizeUsd
		});
		const hasFeeCols = has("openFee") || has("closeFee") || has("fee");
		let fee = 0;
		if (hasFeeCols) {
			const raw = has("openFee") || has("closeFee") ? Math.abs(n("openFee") ?? 0) + Math.abs(n("closeFee") ?? 0) : Math.abs(n("fee") ?? 0);
			const coin = feeCoinOf(cell("fee") ?? cell("openFee"), cell("feeCoin"));
			const usd = feeToUsd(raw, coin, symbol, exitPrice, market);
			if (usd === null) warnings.push("feeNotUsd");
			else fee = usd;
		} else if (pnlFile !== null) {
			const derived = gross + funding - pnlFile * coinToUsd;
			if (derived > 0) {
				fee = derived;
				warnings.push("feeDerived");
			}
		}
		const { pnl, pnlManual } = finalPnl({
			gross,
			fee,
			funding,
			filePnl: pnlFile !== null ? pnlFile * coinToUsd : null,
			sizeUsd
		});
		if (pnlManual) warnings.push("pnlFromFile");
		const leverageRaw = n("leverage");
		const leverage = market === "spot" ? 1 : leverageRaw !== null && leverageRaw >= 1 ? Math.min(leverageRaw, 1e3) : 1;
		const orderId = (cell("orderId") ?? "").trim();
		const baseId = orderId ? `o:${orderId}` : `h:${stableHash([
			symbol,
			side,
			exitAt,
			entryAt,
			entryPrice,
			exitPrice,
			sizeUsd,
			pnl
		].join("|"))}`;
		const dup = (seen.get(baseId) ?? 0) + 1;
		seen.set(baseId, dup);
		return {
			line,
			trade: {
				exchange,
				market_type: market,
				symbol,
				side,
				entry_at: entryAt,
				exit_at: exitAt,
				entry_price: entryPrice,
				exit_price: exitPrice,
				size_usd: round(sizeUsd, 8),
				leverage: round(leverage, 2),
				fee: round(fee, 8),
				funding: round(funding, 8),
				pnl: round(pnl, 8),
				pnl_manual: pnlManual,
				external_id: (dup > 1 ? `${baseId}#${dup}` : baseId).slice(0, 200)
			},
			error: null,
			warnings
		};
	});
}

// src/lib/import/fills.ts
/**
* История исполнений (fills): одна строка = одно исполнение ордера
* (Binance Futures / Spot Trade History, Bybit / OKX Trade History и похожие).
*
* Собираем сделки сами: по каждой паре идём по времени и считаем позицию.
* Позиция открывается с нуля, доливки усредняют вход, встречные исполнения закрывают;
* когда позиция вернулась в ноль — это одна закрытая сделка. Если встречное исполнение
* больше позиции (разворот), лишняя часть открывает новую позицию в другую сторону.
*/
const EPS$1 = 1e-9;
/**
* Long / Short без PnL и без «открытие / закрытие»: какие исполнения закрывают позицию?
* Перебираем варианты (лучевой поиск) и берём тот, где позиция чаще всего возвращается ровно в ноль:
* случайно объёмы в ноль не сходятся, поэтому это надёжный признак настоящих закрытий.
*/
function guessCloses(fills, keyOf) {
	const byKey = /* @__PURE__ */ new Map();
	for (const f of fills) {
		const k = keyOf(f);
		const list = byKey.get(k);
		if (list) list.push(f);
		else byKey.set(k, [f]);
	}
	const closes = /* @__PURE__ */ new Set();
	const BEAM = 96;
	for (const list of byKey.values()) {
		const steps = [];
		let cur = [{
			pos: 0,
			zeros: 0,
			parent: -1,
			close: false
		}];
		for (const f of list) {
			const next = /* @__PURE__ */ new Map();
			const add = (st) => {
				const k = st.pos.toPrecision(10);
				const old = next.get(k);
				if (!old || st.zeros > old.zeros) next.set(k, st);
			};
			cur.forEach((st, i) => {
				add({
					pos: st.pos + f.qty,
					zeros: st.zeros,
					parent: i,
					close: false
				});
				if (st.pos > EPS$1 && f.qty <= st.pos * (1 + 1e-6)) {
					const left = st.pos - f.qty;
					const flat = left <= st.pos * 1e-6;
					add({
						pos: flat ? 0 : left,
						zeros: st.zeros + (flat ? 1 : 0),
						parent: i,
						close: true
					});
				}
			});
			cur = [...next.values()].sort((a, b) => b.zeros - a.zeros || b.pos - a.pos).slice(0, BEAM);
			steps.push(cur);
		}
		let idx = 0;
		cur.forEach((st, i) => {
			const best = cur[idx];
			if (st.zeros > best.zeros || st.zeros === best.zeros && st.pos === 0 && best.pos !== 0) idx = i;
		});
		for (let s = steps.length - 1; s >= 0 && idx >= 0; s--) {
			const st = steps[s][idx];
			if (st.close) closes.add(list[s]);
			idx = st.parent;
		}
	}
	return closes;
}
function parseFills(table, mapping, { utcOffsetMinutes, market: marketChoice, sideFallback }, exchange) {
	const has = (f) => mapping[f] >= 0;
	const out = [];
	const fills = [];
	const fundings = [];
	table.rows.forEach((row, i) => {
		const line = i + 2;
		const cell = (f) => has(f) ? row[mapping[f]] : void 0;
		const n = (f) => parseNumberCell(cell(f));
		const fail = (error, detail) => out.push({
			line,
			trade: null,
			error,
			detail,
			warnings: []
		});
		const symbol = normalizeSymbol(cell("symbol"));
		if (!symbol) return fail("symbol");
		if (/fund|фандинг|资金/i.test(cell("rowType") ?? "")) {
			const at = parseDateCell(cell("closeTime"), utcOffsetMinutes);
			const amount = n("fee") ?? n("funding");
			if (at && amount !== null) fundings.push({
				line,
				symbol,
				at,
				amount: -amount
			});
			return;
		}
		const qtyRaw = n("qty");
		const posDir = sideFallback === "positionSide" ? bareSide(cell("side")) : null;
		const fallback = sideFallback === "qtySign" ? qtyRaw ? Math.sign(qtyRaw) : null : sideFallback === "longIsBuy" ? bareSide(cell("side")) : posDir;
		const sign = posDir ?? fillSign(cell("side")) ?? (has("sideHint") ? fillSign(`${cell("side") ?? ""} ${cell("sideHint") ?? ""}`) : null) ?? fallback;
		if (!sign) return fail("side", [cell("side"), has("sideHint") ? cell("sideHint") : void 0].filter(Boolean).join(" / "));
		const market = marketChoice === "auto" ? marketOf(symbol) : marketChoice;
		const value = n("value");
		let price = n("price");
		if ((price === null || price <= 0) && value && qtyRaw) price = market === "inverse" ? Math.abs(qtyRaw / value) : Math.abs(value / qtyRaw);
		if (price === null || !(price > 0)) return fail("price", cell("price"));
		const qty = Math.abs(qtyRaw ?? (value !== null ? market === "inverse" ? value : value / price : 0));
		if (!(qty > 0)) return fail("size");
		const at = parseDateCell(cell("closeTime"), utcOffsetMinutes);
		if (!at) return fail("time");
		let fee = 0;
		let feeUnknown = false;
		if (has("fee")) {
			const usd = feeToUsd(n("fee") ?? 0, feeCoinOf(cell("fee"), cell("feeCoin")), symbol, price, market);
			if (usd === null) feeUnknown = true;
			else fee = usd;
		}
		const pnlRaw = n("pnl");
		const pnl = pnlRaw === null ? null : market === "inverse" ? pnlRaw * price : pnlRaw;
		const key = (cell("orderId") ?? "").trim() || `${price}|${qty}`;
		fills.push({
			line,
			symbol,
			market,
			sign,
			qty,
			price,
			at,
			fee,
			feeUnknown,
			pnl,
			posDir,
			key
		});
	});
	const byLine = [...fills].sort((a, b) => a.line - b.line);
	const newestFirst = byLine.length > 1 && byLine[0].at > byLine[byLine.length - 1].at;
	const tie = (a, b) => newestFirst ? b.line - a.line : a.line - b.line;
	fills.sort((a, b) => a.at.localeCompare(b.at) || tie(a, b));
	fundings.sort((a, b) => a.at.localeCompare(b.at) || tie(a, b));
	let fi = 0;
	const open = /* @__PURE__ */ new Map();
	const seen = /* @__PURE__ */ new Map();
	const start = (f, qty, fee) => ({
		symbol: f.symbol,
		market: f.market,
		sign: f.sign,
		open: qty,
		entryQty: qty,
		entryNotional: qty * f.price,
		entryCoins: qty / f.price,
		exitQty: 0,
		exitNotional: 0,
		exitCoins: 0,
		fee,
		feeUnknown: f.feeUnknown,
		pnl: 0,
		pnlSeen: false,
		funding: 0,
		entryAt: f.at,
		exitAt: f.at,
		firstLine: f.line,
		lastLine: f.line,
		key: f.key,
		guessed: false
	});
	const emit = (p) => {
		const side = p.sign === 1 ? "long" : "short";
		const inverse = p.market === "inverse";
		const entryPrice = inverse ? p.entryQty / p.entryCoins : p.entryNotional / p.entryQty;
		const exitPrice = inverse ? p.exitQty / p.exitCoins : p.exitNotional / p.exitQty;
		const sizeUsd = inverse ? p.entryQty : p.entryNotional;
		const gross = grossPnl({
			marketType: p.market,
			side,
			entryPrice,
			exitPrice,
			sizeUsd
		});
		const { pnl, pnlManual } = finalPnl({
			gross,
			fee: p.fee,
			funding: p.funding,
			filePnl: p.pnlSeen ? p.pnl : null,
			sizeUsd
		});
		const warnings = [];
		if (p.feeUnknown) warnings.push("feeNotUsd");
		if (p.guessed) warnings.push("sideGuessed");
		if (pnlManual) warnings.push("pnlFromFile");
		const baseId = `f:${stableHash([
			p.symbol,
			side,
			p.entryAt,
			p.key
		].join("|"))}`;
		const dup = (seen.get(baseId) ?? 0) + 1;
		seen.set(baseId, dup);
		const trade = {
			exchange,
			market_type: p.market,
			symbol: p.symbol,
			side,
			entry_at: p.entryAt,
			exit_at: p.exitAt,
			entry_price: round(entryPrice, 12),
			exit_price: round(exitPrice, 12),
			size_usd: round(sizeUsd, 8),
			leverage: 1,
			fee: round(p.fee, 8),
			funding: round(p.funding, 8),
			pnl: round(pnl, 8),
			pnl_manual: pnlManual,
			external_id: (dup > 1 ? `${baseId}#${dup}` : baseId).slice(0, 200)
		};
		out.push({
			line: p.firstLine,
			lineTo: p.lastLine,
			trade,
			error: null,
			warnings
		});
	};
	const byPnl = sideFallback === "positionSide" && has("pnl");
	const posKey = (f) => f.posDir ? `${f.symbol}|${f.posDir}` : f.symbol;
	const realized = (f) => f.pnl !== null && Math.abs(f.pnl) > 1e-9 && Math.abs(Math.abs(f.pnl) - f.fee) > 1e-6 * Math.max(1, f.fee);
	const guessed = sideFallback === "positionSide" && !byPnl ? guessCloses(fills.filter((f) => f.posDir), posKey) : null;
	const isClose = (f, p) => {
		if (!p) return false;
		if (byPnl) return realized(f);
		return guessed?.has(f) ?? false;
	};
	const applyFunding = (until) => {
		while (fi < fundings.length && (until === null || fundings[fi].at <= until)) {
			const fu = fundings[fi++];
			for (const [key, pos] of open) if (key === fu.symbol || key.startsWith(`${fu.symbol}|`)) {
				pos.funding += fu.amount;
				break;
			}
		}
	};
	for (const f of fills) {
		applyFunding(f.at);
		const k = posKey(f);
		const p = open.get(k);
		if (f.posDir) {
			const closing = isClose(f, p);
			if (!p && byPnl && realized(f)) {
				out.push({
					line: f.line,
					trade: null,
					error: "closeNoOpen",
					warnings: []
				});
				continue;
			}
			f.sign = closing ? -f.posDir : f.posDir;
			if (p && !byPnl) p.guessed = true;
			if (closing && p && f.qty > p.open) f.qty = p.open;
		}
		if (!p) {
			if (f.market === "spot" && f.sign === -1) {
				out.push({
					line: f.line,
					trade: null,
					error: "spotNoBuy",
					warnings: []
				});
				continue;
			}
			open.set(k, start(f, f.qty, f.fee));
			continue;
		}
		p.firstLine = Math.min(p.firstLine, f.line);
		p.lastLine = Math.max(p.lastLine, f.line);
		p.feeUnknown ||= f.feeUnknown;
		if (f.sign === p.sign) {
			p.open += f.qty;
			p.entryQty += f.qty;
			p.entryNotional += f.qty * f.price;
			p.entryCoins += f.qty / f.price;
			p.fee += f.fee;
			continue;
		}
		const close = Math.min(f.qty, p.open);
		const part = close / f.qty;
		p.open -= close;
		p.exitQty += close;
		p.exitNotional += close * f.price;
		p.exitCoins += close / f.price;
		p.fee += f.fee * part;
		if (f.pnl !== null) {
			p.pnl += f.pnl;
			p.pnlSeen = true;
		}
		p.exitAt = f.at;
		if (p.open <= EPS$1 * p.entryQty) {
			emit(p);
			open.delete(k);
			const rest = f.qty - close;
			if (rest > EPS$1 * f.qty) {
				if (f.market === "spot") out.push({
					line: f.line,
					trade: null,
					error: "spotNoBuy",
					warnings: []
				});
				else open.set(k, start(f, rest, f.fee * (1 - part)));
			}
		}
	}
	applyFunding(null);
	for (const p of open.values()) out.push({
		line: p.firstLine,
		lineTo: p.lastLine,
		trade: null,
		error: "stillOpen",
		warnings: []
	});
	return out.sort((a, b) => a.line - b.line);
}

// src/lib/import/universal.ts
/** Общий движок импорта для всех бирж: сам понимает, что в файле — закрытые позиции или история исполнений. */
const REQUIRED = {
	positions: [
		"symbol",
		"side",
		["qty", "entryValue"],
		"entryPrice",
		"exitPrice",
		"closeTime"
	],
	fills: [
		"symbol",
		"side",
		["qty", "value"],
		"price",
		"closeTime"
	]
};
function detectMode(mapping) {
	if (mapping.entryPrice >= 0 || mapping.exitPrice >= 0) return "positions";
	if (mapping.price >= 0) return "fills";
	return null;
}
function makeParser(exchange, sideMeaning) {
	const required = (mode) => REQUIRED[mode ?? "positions"].map((r) => Array.isArray(r) ? r[0] : r);
	return {
		exchange,
		fields: FIELDS,
		timeField: "closeTime",
		mode: detectMode,
		required,
		missing(mapping) {
			const mode = detectMode(mapping) ?? "positions";
			return REQUIRED[mode].filter((r) => !(mode === "positions" && r === "side" && mapping.pnl >= 0)).filter((r) => Array.isArray(r) ? r.every((f) => mapping[f] < 0) : mapping[r] < 0).map((r) => Array.isArray(r) ? r[0] : r);
		},
		parse(table, mapping, options) {
			if (detectMode(mapping) === "fills") return parseFills(table, mapping, options, exchange);
			const meaning = sideMeaningFromHeader(mapping.side >= 0 ? table.headers[mapping.side] : void 0, sideMeaning);
			return parsePositions(table, mapping, options, exchange, meaning);
		}
	};
}

// src/lib/sync/hyperliquid.ts
const HL_API = "https://api.hyperliquid.xyz/info";
/** Все исполнения с startTime: страницы по 2000 (Hyperliquid хранит последние 10 000) */
async function fetchHlFills(address, startTime, fetchFn = fetch) {
	const all = [];
	let from = startTime;
	for (let page = 0; page < 10; page++) {
		const res = await fetchFn(HL_API, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				type: "userFillsByTime",
				user: address,
				startTime: from,
				aggregateByTime: true
			})
		});
		if (!res.ok) throw new Error(`HL_HTTP_${res.status}`);
		const part = await res.json();
		all.push(...part);
		if (part.length < 2e3) break;
		from = Math.max(...part.map((f) => f.time)) + 1;
	}
	return all;
}
/** Только бессрочные контракты: у спота нет Long / Short в направлении */
const isPerp = (f) => /long|short/i.test(f.dir) && !f.coin.startsWith("@") && !f.coin.includes("/");
/** Пара для дневника: BTC → BTCUSDC, kPEPE → KPEPEUSDC, xyz:TSLA → XYZ-TSLAUSDC */
const hlSymbol = (coin) => `${coin.toUpperCase().replace(/:/g, "-")}USDC`;
/**
* Исполнения → таблица в формате «истории исполнений».
* По каждой монете пропускаем исполнения до первого открытия «с нуля» (startPosition = 0):
* иначе закрытие позиции, открытой до начала периода, выглядело бы как новая позиция.
*/
function hlFillsToTable(fills) {
	const started = /* @__PURE__ */ new Set();
	return {
		headers: [
			"Symbol",
			"Side",
			"Qty",
			"Price",
			"Fee",
			"Fee Coin",
			"Time",
			"Order ID"
		],
		rows: fills.filter(isPerp).sort((a, b) => a.time - b.time || a.tid - b.tid).filter((f) => {
			if (started.has(f.coin)) return true;
			if (f.startPosition !== void 0 && Number(f.startPosition) !== 0) return false;
			started.add(f.coin);
			return true;
		}).map((f) => [
			hlSymbol(f.coin),
			f.side === "B" ? "Buy" : "Sell",
			f.sz,
			f.px,
			f.fee,
			f.feeToken ?? "USDC",
			new Date(f.time).toISOString(),
			String(f.oid)
		]),
		delimiter: ","
	};
}
const parser = makeParser("hyperliquid", "opening");
/**
* Исполнения → закрытые сделки + курсор для следующей синхронизации:
* если какая-то позиция ещё открыта — следующий раз грузим с её первого исполнения (чтобы собрать её целиком).
*/
function hlFillsToTrades(fills) {
	const table = hlFillsToTable(fills);
	if (!table.rows.length) return {
		trades: [],
		cursor: null
	};
	const prep = prepareImport(table, parser);
	const trades = prep.rows.flatMap((r) => r.trade ? [r.trade] : []);
	const openStarts = prep.rows.filter((r) => r.error === "stillOpen").map((r) => Date.parse(table.rows[r.line - 2][6]));
	const lastTime = Date.parse(table.rows[table.rows.length - 1][6]);
	return {
		trades,
		cursor: openStarts.length ? Math.min(...openStarts) : lastTime + 1
	};
}

// src/lib/sync/polymarket.ts
/**
* Polymarket → сделки. Нужен только адрес кошелька аккаунта Polymarket (proxy / deposit wallet из профиля, не адрес подписи).
* Источник — Data API v2: GET /v2/positions?user=…&status=CLOSED — закрытые позиции с итоговым PnL.
* Сделка = закрытая позиция по исходу (Yes / No…): вход — средняя цена покупки, выход — средняя цена продажи / погашения
* (из PnL: выход = вход + PnL / число долей; проигравший исход — 0).
* Настоящий ответ v2 (сверено 05.11.2026): snake_case — condition_id, avg_price, total_size (доли), realized_pnl, title, outcome,
* first_entry_at / last_event_at (секунды); { data: [...], pagination: { next_cursor, has_more } }. Старые camelCase-поля тоже понимаем.
*/
const PM_API = "https://data-api.polymarket.com";
const pick = (o, ...keys) => {
	for (const k of keys) if (o[k] !== void 0 && o[k] !== null && o[k] !== "") return o[k];
};
const num$1 = (o, ...keys) => {
	const v = pick(o, ...keys);
	const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
	return Number.isFinite(n) ? n : null;
};
const str = (o, ...keys) => {
	const v = pick(o, ...keys);
	return typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : null;
};
const toIso = (ts) => ts !== null && ts > 0 ? new Date(ts < 0xe8d4a51000 ? ts * 1e3 : ts).toISOString() : null;
/** Время закрытия: последнее событие позиции (секунды или мс), иначе дата окончания рынка */
function closeTime(p) {
	const iso = toIso(num$1(p, "last_event_at", "lastEventAt", "timestamp", "closedAt", "closed_at", "updatedAt", "updated_at"));
	if (iso) return iso;
	const d = str(p, "endDate", "end_date", "closedAt", "closed_at");
	if (d && !Number.isNaN(Date.parse(d))) return new Date(Date.parse(d)).toISOString();
	return null;
}
/** Одна закрытая позиция → сделка (null — данных не хватает) */
function pmPositionToTrade(p) {
	const cond = str(p, "conditionId", "condition_id", "market");
	const avg = num$1(p, "avgPrice", "avg_price");
	const shares = num$1(p, "total_size", "totalSize", "totalBought", "total_bought", "size");
	const pnl = num$1(p, "realizedPnl", "realized_pnl", "cashPnl", "cash_pnl");
	const at = closeTime(p);
	if (!cond || avg === null || avg <= 0 || !shares || shares <= 0 || pnl === null || !at) return null;
	const outcome = str(p, "outcome") ?? `#${num$1(p, "outcomeIndex", "outcome_index") ?? 0}`;
	const title = str(p, "title", "question", "market_title") ?? cond;
	const exit = Math.min(1, Math.max(0, avg + pnl / shares));
	const opened = toIso(num$1(p, "first_entry_at", "firstEntryAt"));
	const entryAt = opened && opened <= at ? opened : at;
	const code = outcome.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) || "O";
	return {
		exchange: "polymarket",
		market_type: "prediction",
		symbol: `PM-${cond.replace(/^0x/i, "").slice(0, 8).toUpperCase()}-${code}`,
		title: `${title} — ${outcome}`.slice(0, 300),
		side: "long",
		entry_at: entryAt,
		exit_at: at,
		entry_price: round(avg, 8),
		exit_price: round(exit, 8),
		size_usd: round(shares * avg, 8),
		leverage: 1,
		fee: 0,
		funding: 0,
		pnl: round(pnl, 8),
		pnl_manual: false,
		external_id: `pm:${cond}:${outcome}`.slice(0, 200)
	};
}
/** Все закрытые позиции кошелька: страницы по 50, курсор pagination.next_cursor (в v2 нет offset) */
async function fetchPmClosed(get, user) {
	const out = [];
	let cursor = "";
	for (let page = 0; page < 200; page++) {
		const res = await get("/v2/positions", {
			user,
			status: "CLOSED",
			limit: 50,
			...cursor ? { cursor } : {}
		});
		const r = res ?? {};
		const items = Array.isArray(res) ? res : pick(r, "data", "positions", "results") ?? [];
		out.push(...items);
		const pag = r.pagination ?? {};
		const next = Array.isArray(res) ? "" : str(pag, "next_cursor", "nextCursor") ?? str(r, "next_cursor", "nextCursor") ?? "";
		if (!next || !items.length) break;
		cursor = next;
	}
	return out;
}
/** Прямой запрос к Data API (сервер; из браузера — через exchange-proxy) */
function pmDirectGet(fetchFn = fetch) {
	return async (path, params) => {
		const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
		const res = await fetchFn(`${PM_API}${path}?${q}`);
		if (!res.ok) throw new Error(`PM_HTTP_${res.status} network`);
		return res.json();
	};
}

// src/lib/sync/cex.ts
var ExchangeError = class extends Error {
	kind;
	detail;
	constructor(kind, detail) {
		super(detail);
		this.kind = kind;
		this.detail = detail;
	}
};
const DAY = 864e5;
/** Число из строки биржи; пусто / мусор — null */
const num = (v) => {
	if (v === void 0 || v === null || v === "") return null;
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
};
/** Отрезок [from, to] → окна не длиннее size */
function windows(from, to, size) {
	const out = [];
	for (let s = from; s < to; s += size) out.push([s, Math.min(s + size - 1, to)]);
	return out;
}
/** Задачи по `parallel` одновременно (биржи ограничивают число запросов в секунду) */
async function inBatches(items, parallel, fn) {
	for (let i = 0; i < items.length; i += parallel) await Promise.all(items.slice(i, i + parallel).map(fn));
}
/** BTC-USDT, BTC-USDT-SWAP, BTC_USDT → BTCUSDT (как у Bybit) */
const plainSymbol = (s) => s.toUpperCase().replace(/-SWAP$/, "").replace(/[-_/]/g, "");
const clampLeverage = (v) => Math.min(1e3, Math.max(1, v && v > 0 ? v : 1));

// src/lib/sync/bingx.ts
/**
* BingX (бессрочные USDT / USDC) → сделки. Источник — /openApi/swap/v2/trade/positionHistory (закрытые позиции).
* BingX отдаёт историю только по одной паре — список пар берём из движения средств (/openApi/swap/v2/user/income,
* записи REALIZED_PNL: пара, в которой что-то закрывалось). Глубина — 90 дней.
*/
function bingxError(r) {
	const code = Number(r?.code ?? -1);
	const detail = `${code}: ${r?.msg ?? ""}`;
	if ([
		100001,
		100412,
		100413,
		100421
	].includes(code)) return new ExchangeError("KEY_INVALID", detail);
	if (code === 100419) return new ExchangeError("KEY_IP", detail);
	if (code === 100004) return new ExchangeError("KEY_NO_PERMISSION", detail);
	if (code === 100410 || code === 109400) return new ExchangeError("RATE_LIMIT", detail);
	return new ExchangeError("EXCHANGE", detail);
}
async function bingxGet(call, path, params) {
	const r = await call(path, params);
	if (!r || r.code !== void 0 && r.code !== 0) throw bingxError(r);
	return r.data ?? r;
}
/**
* Одна закрытая позиция → сделка. Количество монет считаем из валового PnL и цен:
* поле positionAmt у BingX бывает в контрактах, а realisedProfit = (выход − вход) × количество — точно.
*/
function bingxPositionToTrade(p) {
	if (p.closeAllPositions === false) return null;
	const entry = num(p.avgPrice);
	const exit = num(p.avgClosePrice);
	const gross = num(p.realisedProfit ?? p.realizedProfit);
	const net = num(p.netProfit);
	const opened = num(p.openTime);
	const closed = num(p.updateTime);
	if (!entry || !exit || entry <= 0 || exit <= 0 || gross === null || net === null || !closed) return null;
	const side = String(p.positionSide).toUpperCase() === "SHORT" ? "short" : "long";
	const move = side === "long" ? exit - entry : entry - exit;
	const qty = Math.abs(move) / entry > 1e-7 && gross !== 0 ? gross / move : num(p.closePositionAmt ?? p.positionAmt);
	if (!qty || qty <= 0) return null;
	return {
		exchange: "bingx",
		market_type: "linear",
		symbol: plainSymbol(p.symbol),
		side,
		entry_at: new Date(opened ?? closed).toISOString(),
		exit_at: new Date(closed).toISOString(),
		entry_price: entry,
		exit_price: exit,
		size_usd: round(qty * entry, 8),
		leverage: clampLeverage(num(p.leverage)),
		fee: round(Math.abs(num(p.positionCommission) ?? 0), 8),
		funding: round(num(p.totalFunding) ?? 0, 8),
		pnl: round(net, 8),
		pnl_manual: false,
		external_id: `bx:${p.positionId}`
	};
}
/** Ключ: только право «Чтение» (2). 1 — спот, 3 — фьючерсы, 4 — переводы, 5 — вывод, 7 — переводы субаккаунтов */
async function checkBingxKey(call) {
	const perms = ((await bingxGet(call, "/openApi/v1/account/apiPermissions", {}))?.permissions ?? []).map(Number);
	return { readOnly: perms.length > 0 && perms.every((p) => p === 2) };
}
const INCOME_WINDOW$1 = 7 * DAY;
const HISTORY_WINDOW = 90 * DAY;
const PAGE$2 = 100;
/** Пары, в которых с from по to что-то закрывалось (USDT- и USDC-контракты) */
async function bingxSymbols(call, from, to) {
	const found = /* @__PURE__ */ new Set();
	const jobs = ["USDT", "USDC"].flatMap((currency) => windows(from, to, INCOME_WINDOW$1).map((w) => ({
		currency,
		w
	})));
	await inBatches(jobs, 3, async ({ currency, w }) => {
		const rows = await bingxGet(call, "/openApi/swap/v2/user/income", {
			currency,
			incomeType: "REALIZED_PNL",
			startTime: w[0],
			endTime: w[1],
			limit: 1e3
		});
		for (const r of Array.isArray(rows) ? rows : []) if (r.symbol) found.add(r.symbol);
	});
	return [...found].sort();
}
async function fetchBingxTrades(call, from, to) {
	const symbols = await bingxSymbols(call, from, to);
	const out = /* @__PURE__ */ new Map();
	const seen = /* @__PURE__ */ new Set();
	const jobs = symbols.flatMap((symbol) => windows(from, to, HISTORY_WINDOW).map((w) => ({
		symbol,
		w
	})));
	await inBatches(jobs, 3, async ({ symbol, w }) => {
		for (let pageIndex = 0; pageIndex < 50; pageIndex++) {
			const d = await bingxGet(call, "/openApi/swap/v2/trade/positionHistory", {
				symbol,
				currency: symbol.endsWith("-USDC") ? "USDC" : "USDT",
				startTime: w[0],
				endTime: w[1],
				pageIndex,
				pageSize: PAGE$2
			});
			const list = Array.isArray(d) ? d : d?.positionHistory ?? [];
			let fresh = 0;
			for (const p of list) {
				if (seen.has(p.positionId)) continue;
				seen.add(p.positionId);
				fresh++;
				const t = bingxPositionToTrade(p);
				if (t) out.set(t.external_id, t);
			}
			if (list.length < PAGE$2 || fresh === 0) break;
		}
	});
	return [...out.values()];
}
const bingxModule = {
	historyDays: 90,
	overlapMs: 2 * DAY,
	check: checkBingxKey,
	fetch: async (call, from, to) => ({
		trades: await fetchBingxTrades(call, from, to),
		cursor: to
	})
};

// src/lib/sync/okx.ts
/**
* OKX API v5 → сделки. Источник — /api/v5/account/positions-history (закрытые позиции за 3 месяца):
* одна запись = одна позиция с ценами входа / выхода, PnL, комиссиями и фандингом от биржи.
* Размер — в контрактах: стоимость контракта (ctVal) берём из списка инструментов (/api/v5/public/instruments).
* Только бессрочные контракты (SWAP). Регион ключа (общий, Европа, США) подбирает подпись (callExchange).
*/
function okxError(r) {
	const code = String(r?.code ?? "");
	const detail = `${code}: ${r?.msg ?? ""}`;
	if ([
		"50100",
		"50101",
		"50105",
		"50111",
		"50113",
		"50119"
	].includes(code)) return new ExchangeError("KEY_INVALID", detail);
	if (code === "50110") return new ExchangeError("KEY_IP", detail);
	if (code === "50120" || code === "50030") return new ExchangeError("KEY_NO_PERMISSION", detail);
	if (code === "50011" || code === "50061") return new ExchangeError("RATE_LIMIT", detail);
	return new ExchangeError("EXCHANGE", detail);
}
async function okxGet(call, path, params) {
	const r = await call(path, params);
	if (!r || r.code !== "0") throw okxError(r);
	return r.data ?? [];
}
/** Полностью закрытые (в том числе ликвидацией и ADL); частичные закрытия придут позже — целой позицией */
const FULL = /* @__PURE__ */ new Set([
	"2",
	"3",
	"5"
]);
/** Одна закрытая позиция OKX → сделка (null — неполная запись или неизвестный инструмент) */
function okxPositionToTrade(p, inst) {
	if (!inst || !FULL.has(p.type)) return null;
	const entry = num(p.openAvgPx);
	const exit = num(p.closeAvgPx);
	const contracts = num(p.closeTotalPos);
	const ctVal = num(inst.ctVal);
	const pnlRaw = num(p.realizedPnl);
	const opened = num(p.cTime);
	const closed = num(p.uTime);
	if (!entry || !exit || entry <= 0 || exit <= 0 || !contracts || contracts <= 0 || !ctVal || pnlRaw === null || !closed) return null;
	const market = inst.ctType === "inverse" ? "inverse" : "linear";
	const side = p.direction === "short" ? "short" : "long";
	const size = market === "inverse" ? contracts * ctVal : contracts * ctVal * entry;
	const toUsd = (v) => market === "inverse" ? v * exit : v;
	return {
		exchange: "okx",
		market_type: market,
		symbol: plainSymbol(p.instId),
		side,
		entry_at: new Date(opened ?? closed).toISOString(),
		exit_at: new Date(closed).toISOString(),
		entry_price: entry,
		exit_price: exit,
		size_usd: round(size, 8),
		leverage: clampLeverage(num(p.lever)),
		fee: round(toUsd(Math.abs(num(p.fee) ?? 0) + Math.abs(num(p.liqPenalty) ?? 0)), 8),
		funding: round(toUsd(num(p.fundingFee) ?? 0), 8),
		pnl: round(toUsd(pnlRaw), 8),
		pnl_manual: false,
		external_id: `okx:${p.posId}:${p.cTime}`
	};
}
/** Ключ: права только «Чтение» (perm = read_only; trade / withdraw — отказ) */
async function checkOkxKey(call) {
	const [cfg] = await okxGet(call, "/api/v5/account/config", {});
	const perms = (cfg?.perm ?? "").split(",").map((s) => s.trim()).filter(Boolean);
	return { readOnly: perms.length > 0 && perms.every((p) => p === "read_only") };
}
const PAGE$1 = 100;
/** Закрытые позиции с from по to: страницы по 100 от новых к старым (after = uTime последней) */
async function fetchOkxTrades(call, from, to) {
	const instruments = new Map((await okxGet(call, "/api/v5/public/instruments", { instType: "SWAP" })).map((i) => [i.instId, i]));
	const out = [];
	let after = String(to);
	for (let page = 0; page < 200; page++) {
		const list = await okxGet(call, "/api/v5/account/positions-history", {
			instType: "SWAP",
			limit: PAGE$1,
			after
		});
		for (const p of list) {
			const t = (num(p.uTime) ?? 0) >= from ? okxPositionToTrade(p, instruments.get(p.instId)) : null;
			if (t) out.push(t);
		}
		const oldest = Math.min(...list.map((p) => num(p.uTime) ?? Infinity));
		if (list.length < PAGE$1 || !Number.isFinite(oldest) || oldest < from || String(oldest) === after) break;
		after = String(oldest);
	}
	return out;
}
const okxModule = {
	historyDays: 90,
	overlapMs: 2 * DAY,
	check: checkOkxKey,
	fetch: async (call, from, to) => ({
		trades: await fetchOkxTrades(call, from, to),
		cursor: to
	})
};

// src/lib/sync/bitget.ts
/**
* Bitget → сделки. Источник — история закрытых позиций (последние 90 дней):
*  - единый торговый аккаунт (UTA): /api/v3/position/history-position (окна до 30 дней, страницы по cursor);
*  - классический аккаунт: /api/v2/mix/position/history-position (страницы по idLessThan).
* Какой аккаунт — узнаём по /api/v3/account/settings (у классического он отвечает ошибкой).
* Одна запись = одна закрытая позиция: цены входа / выхода, размер в монете, чистый результат, комиссии и фандинг.
*/
function bitgetError(r) {
	const code = String(r?.code ?? "");
	const detail = `${code}: ${r?.msg ?? ""}`;
	if ([
		"40006",
		"40009",
		"40011",
		"40012",
		"40037"
	].includes(code)) return new ExchangeError("KEY_INVALID", detail);
	if (code === "40018") return new ExchangeError("KEY_IP", detail);
	if (code === "40014" || code === "40022") return new ExchangeError("KEY_NO_PERMISSION", detail);
	if (code === "429" || code === "43001") return new ExchangeError("RATE_LIMIT", detail);
	return new ExchangeError("EXCHANGE", detail);
}
async function bitgetGet(call, path, params) {
	const r = await call(path, params);
	if (!r || r.code !== "00000") throw bitgetError(r);
	return r.data;
}
/** Фьючерсы: USDT, USDC и монетные (COIN-M — инверсные) */
const PRODUCTS = [
	"USDT-FUTURES",
	"USDC-FUTURES",
	"COIN-FUTURES"
];
/** Одна закрытая позиция Bitget → сделка (null — неполная запись) */
function bitgetPositionToTrade(p, product) {
	const entry = num(p.openPriceAvg ?? p.openAvgPrice);
	const exit = num(p.closePriceAvg ?? p.closeAvgPrice);
	const qty = num(p.closeTotalPos);
	const net = num(p.netProfit);
	const opened = num(p.createdTime ?? p.ctime);
	const closed = num(p.updatedTime ?? p.utime);
	if (!entry || !exit || entry <= 0 || exit <= 0 || !qty || qty <= 0 || net === null || !closed) return null;
	const market = product === "COIN-FUTURES" ? "inverse" : "linear";
	const side = (p.posSide ?? p.holdSide) === "short" ? "short" : "long";
	const toUsd = (v) => market === "inverse" ? v * exit : v;
	const fee = Math.abs(num(p.openFeeTotal ?? p.openFee) ?? 0) + Math.abs(num(p.closeFeeTotal ?? p.closeFee) ?? 0);
	const at = opened ?? closed;
	return {
		exchange: "bitget",
		market_type: market,
		symbol: plainSymbol(p.symbol),
		side,
		entry_at: new Date(at).toISOString(),
		exit_at: new Date(closed).toISOString(),
		entry_price: entry,
		exit_price: exit,
		size_usd: round(qty * entry, 8),
		leverage: clampLeverage(num(p.leverage)),
		fee: round(toUsd(fee), 8),
		funding: round(toUsd(num(p.totalFunding) ?? 0), 8),
		pnl: round(toUsd(net), 8),
		pnl_manual: false,
		external_id: `bg:${p.symbol}:${side}:${at}`
	};
}
/**
* Ключ: «только чтение».
*  - единый аккаунт (UTA): /api/v3/account/info → permType = read-only;
*  - классический: /api/v2/spot/account/info → authorities (права ключа, например ["readonly"] или ["trade", "readonly"]):
*    любое право на торговлю / перевод / вывод — отказ, как у остальных бирж (дыра №1 из плана портфеля, 16.11.2026).
*    Если Bitget не прислал список прав вовсе — ключ принимаем, проверив, что он рабочий: сайт всё равно ходит к Bitget
*    только по адресам для чтения (список в exchange-proxy).
*/
const WRITE_RIGHT = /trade|transfer|withdraw|write|order/i;
async function checkBitgetKey(call) {
	const r = await call("/api/v3/account/info", {});
	if (r?.code === "00000") return { readOnly: r.data?.permType === "read-only" };
	const err = bitgetError(r);
	if (err.kind !== "EXCHANGE") throw err;
	const info = await call("/api/v2/spot/account/info", {});
	if (info?.code === "00000" && Array.isArray(info.data?.authorities)) {
		const rights = info.data.authorities.map(String);
		return { readOnly: rights.length > 0 && !rights.some((a) => WRITE_RIGHT.test(a)) };
	}
	await bitgetGet(call, "/api/v2/mix/position/history-position", {
		productType: "USDT-FUTURES",
		limit: 1
	});
	return { readOnly: true };
}
const PAGE = 100;
const WINDOW = 30 * DAY;
async function isUta(call) {
	const r = await call("/api/v3/account/settings", {});
	if (r?.code === "00000") return true;
	const err = bitgetError(r);
	if (err.kind !== "EXCHANGE") throw err;
	return false;
}
async function fetchBitgetTrades(call, from, to) {
	const uta = await isUta(call);
	const out = [];
	for (const product of PRODUCTS) for (const [s, e] of windows(from, to, WINDOW)) {
		let cursor = "";
		for (let page = 0; page < 100; page++) {
			const base = {
				startTime: s,
				endTime: e,
				limit: PAGE
			};
			const data = uta ? await bitgetGet(call, "/api/v3/position/history-position", {
				...base,
				category: product,
				...cursor ? { cursor } : {}
			}) : await bitgetGet(call, "/api/v2/mix/position/history-position", {
				...base,
				productType: product,
				...cursor ? { idLessThan: cursor } : {}
			});
			const list = data?.list ?? [];
			for (const p of list) {
				const t = bitgetPositionToTrade(p, product);
				if (t) out.push(t);
			}
			const next = (uta ? data.cursor : data.endId) ?? "";
			if (list.length < PAGE || !next || next === cursor) break;
			cursor = next;
		}
	}
	return out;
}
const bitgetModule = {
	historyDays: 90,
	overlapMs: 2 * DAY,
	check: checkBitgetKey,
	fetch: async (call, from, to) => ({
		trades: await fetchBitgetTrades(call, from, to),
		cursor: to
	})
};

// src/lib/sync/binance.ts
/**
* Binance USDⓈ-M фьючерсы → сделки. Готовой истории закрытых позиций у Binance нет — собираем позиции из исполнений:
*  1. движение средств /fapi/v1/income (90 дней): пары, где были комиссии / PnL, и фандинг по парам;
*  2. исполнения /fapi/v1/userTrades по каждой паре — окнами по 7 дней (так требует Binance);
*  3. исполнения → позиции: от нуля до нуля (в режиме хеджирования LONG и SHORT — отдельно, переворот в одном исполнении делится).
* PnL = сумма realizedPnl биржи − комиссии + фандинг за время позиции. Комиссия в BNB в доллары не переводится (0).
* Курсор — как у Hyperliquid: если позиция ещё открыта, в следующий раз грузим с её первого исполнения.
*/
function binanceError(r) {
	const code = Number(r.code);
	const detail = `${code}: ${r.msg ?? ""}`;
	if ([
		-2008,
		-2014,
		-2015,
		-1022
	].includes(code)) return new ExchangeError("KEY_INVALID", detail);
	if (code === -1003 || code === -1015) return new ExchangeError("RATE_LIMIT", detail);
	if (code === -2011 || code === -1002) return new ExchangeError("KEY_NO_PERMISSION", detail);
	return new ExchangeError("EXCHANGE", detail);
}
async function binanceGet(call, path, params) {
	const r = await call(path, params);
	if (r && typeof r === "object" && !Array.isArray(r) && typeof r.code === "number" && r.code < 0) throw binanceError(r);
	return r;
}
/** Ключ: включено только «Чтение» (торговля, вывод, переводы, маржа, опционы — выключены) */
async function checkBinanceKey(call) {
	const r = await binanceGet(call, "/sapi/v1/account/apiRestrictions", {});
	if (!r || r.enableReading !== true) return { readOnly: false };
	return { readOnly: Object.entries(r).filter(([k]) => /^(enable|permits)/.test(k) && k !== "enableReading").every(([, v]) => v === false) };
}
const EPS = 1e-9;
/** Комиссия в долларах: USDT / USDC — как есть, BNB и прочее — 0 (курса нет) */
const feeUsd = (f) => USD_COINS.has(f.commissionAsset?.toUpperCase()) ? Math.abs(num(f.commission) ?? 0) : 0;
/**
* Исполнения → закрытые позиции и время начала ещё открытых.
* Исполнения, которые закрывают позицию, открытую до начала периода (realizedPnl ≠ 0 «с нуля»), пропускаем.
*/
function binanceFillsToTrades(fills, funding = []) {
	const groups = /* @__PURE__ */ new Map();
	for (const f of fills) {
		const key = `${f.symbol}|${f.positionSide ?? "BOTH"}`;
		groups.set(key, [...groups.get(key) ?? [], f]);
	}
	const trades = [];
	const openStarts = [];
	const finish = (o) => {
		if (o.openQty <= EPS || o.closeQty <= EPS) return;
		const entry = o.openVal / o.openQty;
		const exit = o.closeVal / o.closeQty;
		const fund = funding.filter((x) => x.symbol === o.symbol && x.incomeType === "FUNDING_FEE" && x.time >= o.start && x.time <= o.end).reduce((s, x) => s + (num(x.income) ?? 0), 0);
		trades.push({
			exchange: "binance",
			market_type: "linear",
			symbol: o.symbol,
			side: o.side,
			entry_at: new Date(o.start).toISOString(),
			exit_at: new Date(o.end).toISOString(),
			entry_price: round(entry, 10),
			exit_price: round(exit, 10),
			size_usd: round(o.openVal, 8),
			leverage: 1,
			fee: round(o.fee, 8),
			funding: round(fund, 8),
			pnl: round(o.realized - o.fee + fund, 8),
			pnl_manual: false,
			external_id: `bn:${o.key}:${o.firstId}`
		});
	};
	for (const [key, list] of groups) {
		list.sort((a, b) => a.time - b.time || a.id - b.id);
		let cur = null;
		let started = false;
		const forced = key.endsWith("|LONG") ? 1 : key.endsWith("|SHORT") ? -1 : 0;
		for (const f of list) {
			const qty = num(f.qty) ?? 0;
			const price = num(f.price) ?? 0;
			if (qty <= 0 || price <= 0) continue;
			const sign = f.side === "BUY" ? 1 : -1;
			const fee = feeUsd(f);
			const pnl = num(f.realizedPnl) ?? 0;
			if (!cur) {
				if (!started && pnl !== 0) continue;
				if (forced && sign !== forced) continue;
				started = true;
				cur = {
					key,
					symbol: f.symbol,
					side: sign > 0 ? "long" : "short",
					firstId: f.id,
					start: f.time,
					end: f.time,
					openQty: 0,
					openVal: 0,
					closeQty: 0,
					closeVal: 0,
					fee: 0,
					realized: 0,
					pos: 0
				};
			}
			cur.end = f.time;
			if (sign === (cur.side === "long" ? 1 : -1)) {
				cur.openQty += qty;
				cur.openVal += qty * price;
				cur.fee += fee;
				cur.pos += sign * qty;
				continue;
			}
			const closing = Math.min(qty, Math.abs(cur.pos));
			const share = closing / qty;
			cur.closeQty += closing;
			cur.closeVal += closing * price;
			cur.fee += fee * share;
			cur.realized += pnl;
			cur.pos += sign * closing;
			if (Math.abs(cur.pos) <= EPS * Math.max(1, cur.openQty)) {
				finish(cur);
				const rest = qty - closing;
				cur = null;
				if (rest > EPS * qty && key.endsWith("|BOTH")) cur = {
					key,
					symbol: f.symbol,
					side: sign > 0 ? "long" : "short",
					firstId: f.id,
					start: f.time,
					end: f.time,
					openQty: rest,
					openVal: rest * price,
					closeQty: 0,
					closeVal: 0,
					fee: fee * (1 - share),
					realized: 0,
					pos: sign * rest
				};
			}
		}
		if (cur) openStarts.push(cur.start);
	}
	return {
		trades,
		openStarts
	};
}
const TRADES_WINDOW = 7 * DAY;
const INCOME_WINDOW = 7 * DAY;
/** Движение средств с from по to: окна по 7 дней, по 1000 записей (полная страница — продолжаем с её последнего времени) */
async function fetchBinanceIncome(call, from, to) {
	const out = /* @__PURE__ */ new Map();
	await inBatches(windows(from, to, INCOME_WINDOW), 3, async ([s, e]) => {
		let start = s;
		for (let page = 0; page < 20; page++) {
			const rows = await binanceGet(call, "/fapi/v1/income", {
				startTime: start,
				endTime: e,
				limit: 1e3
			});
			const list = Array.isArray(rows) ? rows : [];
			for (const r of list) out.set(`${r.incomeType}:${r.tranId ?? ""}:${r.symbol ?? ""}:${r.time}:${r.income}`, r);
			if (list.length < 1e3) break;
			const last = Math.max(...list.map((r) => r.time));
			if (last <= start) break;
			start = last;
		}
	});
	return [...out.values()];
}
/** Исполнения пары с from по to: окна по 7 дней; полная страница — дальше по fromId */
async function fetchBinanceFills(call, symbol, from, to) {
	const out = /* @__PURE__ */ new Map();
	for (const [s, e] of windows(from, to, TRADES_WINDOW)) {
		let list = await binanceGet(call, "/fapi/v1/userTrades", {
			symbol,
			startTime: s,
			endTime: e,
			limit: 1e3
		});
		for (let page = 0; page < 20 && Array.isArray(list); page++) {
			for (const f of list) if (f.time <= e) out.set(f.id, f);
			if (list.length < 1e3 || list.some((f) => f.time > e)) break;
			list = await binanceGet(call, "/fapi/v1/userTrades", {
				symbol,
				fromId: Math.max(...list.map((f) => f.id)) + 1,
				limit: 1e3
			});
		}
	}
	return [...out.values()];
}
async function fetchBinanceTrades(call, from, to) {
	const income = await fetchBinanceIncome(call, from, to);
	const symbols = [...new Set(income.filter((r) => r.symbol && (r.incomeType === "COMMISSION" || r.incomeType === "REALIZED_PNL")).map((r) => r.symbol))].sort();
	const fills = [];
	await inBatches(symbols, 3, async (symbol) => {
		fills.push(...await fetchBinanceFills(call, symbol, from, to));
	});
	const { trades, openStarts } = binanceFillsToTrades(fills, income);
	const lastFill = fills.length ? Math.max(...fills.map((f) => f.time)) + 1 : to;
	return {
		trades,
		cursor: openStarts.length ? Math.min(...openStarts) : Math.min(lastFill, to)
	};
}
const binanceModule = {
	historyDays: 90,
	overlapMs: 0,
	check: checkBinanceKey,
	fetch: fetchBinanceTrades
};

// src/lib/sync/run.ts
/** Биржи с ключом API, кроме Bybit (у него свой путь — с датой окончания ключа) */
const CEX_MODULES = {
	bingx: bingxModule,
	okx: okxModule,
	bitget: bitgetModule,
	binance: binanceModule
};
/** Ошибка подключения / синхронизации — код для текста в i18n (connections.errors) */
var SyncError = class extends Error {
	code;
	detail;
	constructor(code, detail = "") {
		super(code);
		this.code = code;
		this.detail = detail;
	}
};
/** Ошибки Bybit, понятные человеку */
function bybitErrorCode(e) {
	if ([
		10003,
		10004,
		33004
	].includes(e.code)) return "KEY_INVALID";
	if (e.code === 10005) return "KEY_NO_PERMISSION";
	if (e.code === 10010) return "KEY_IP";
	if (e.code === 10006 || e.code === 10018) return "RATE_LIMIT";
	return "EXCHANGE";
}
function toSyncError(e) {
	if (e instanceof SyncError) return e;
	if (e instanceof BybitError) return new SyncError(bybitErrorCode(e), `${e.code}: ${e.message}`);
	if (e instanceof ExchangeError) return new SyncError(e.kind, e.detail);
	const msg = e && typeof e === "object" && "message" in e ? String(e.message) : String(e);
	if (msg.includes("FREE_LIMIT_REACHED")) return new SyncError("FREE_LIMIT");
	if (/HL_HTTP|PM_HTTP|fetch|network/i.test(msg)) return new SyncError("EXCHANGE_DOWN", msg);
	return new SyncError("UNKNOWN", msg);
}
/** 0x1234…abcd / ключ: первые и последние символы */
const shortKey = (key) => key.length > 12 ? `${key.slice(0, 6)}…${key.slice(-4)}` : key;
/** Скачать новые сделки подключения и записать их (дубли и лимит — как при импорте файла) */
async function runSync(conn, deps) {
	const now = (deps.now ?? Date.now)();
	try {
		let trades;
		let nextCursor;
		if (conn.exchange === "bybit") {
			const call = deps.cexCall;
			const info = await checkBybitKey(call);
			if (!info.readOnly) throw new SyncError("KEY_NOT_READONLY");
			await deps.setKeyExpiry?.(info.expiresAt);
			const from = conn.cursor_at ? Date.parse(conn.cursor_at) - 2 * DAY$1 : now - 730 * DAY$1;
			trades = await fetchBybitTrades(call, from, now);
			nextCursor = now;
		} else if (CEX_MODULES[conn.exchange]) {
			const m = CEX_MODULES[conn.exchange];
			const info = await m.check(deps.cexCall);
			if (!info.readOnly) throw new SyncError("KEY_NOT_READONLY");
			if (info.expiresAt !== void 0) await deps.setKeyExpiry?.(info.expiresAt);
			const from = conn.cursor_at ? Date.parse(conn.cursor_at) - m.overlapMs : now - m.historyDays * DAY$1;
			const res = await m.fetch(deps.cexCall, Math.max(from, now - m.historyDays * DAY$1), now);
			trades = res.trades;
			nextCursor = res.cursor;
		} else if (conn.exchange === "hyperliquid") {
			const from = conn.cursor_at ? Date.parse(conn.cursor_at) : 0;
			const res = hlFillsToTrades(await fetchHlFills(conn.api_key, from, deps.fetchFn));
			trades = res.trades;
			nextCursor = res.cursor;
		} else if (conn.exchange === "evm" || conn.exchange === "solana") {
			trades = [];
			nextCursor = now;
		} else if (conn.exchange === "polymarket") {
			trades = (await fetchPmClosed(deps.polymarketGet ?? pmDirectGet(deps.fetchFn), conn.api_key)).flatMap((p) => {
				const t = pmPositionToTrade(p);
				return t ? [t] : [];
			});
			nextCursor = now;
		} else throw new SyncError("UNSUPPORTED");
		trades = [...new Map(trades.map((t) => [t.external_id, t])).values()];
		const existing = await deps.existingIds(conn.exchange, trades.map((t) => t.external_id));
		if (deps.twins) for (const id of await deps.twins(conn.exchange, trades.filter((t) => !existing.has(t.external_id)))) existing.add(id);
		const rows = trades.map((trade, i) => ({
			line: i + 2,
			trade,
			error: null,
			warnings: []
		}));
		const plan = planImport(rows, existing, await deps.remaining());
		let inserted = 0;
		if (plan.toInsert.length) {
			const res = await deps.insert({
				exchange: conn.exchange,
				filename: `API · ${conn.label ?? shortKey(conn.api_key)}`,
				trades: plan.toInsert
			});
			inserted = res.inserted;
			if (res.error) throw res.error;
		}
		const cursor = plan.counts.overLimit > 0 || nextCursor === null ? null : new Date(nextCursor).toISOString();
		await deps.touch(cursor, null);
		return {
			found: trades.length,
			inserted,
			overLimit: plan.counts.overLimit
		};
	} catch (e) {
		const err = toSyncError(e);
		await deps.touch(null, `${err.code}${err.detail ? ` | ${err.detail}` : ""}`.slice(0, 500));
		throw err;
	}
}

// supabase/functions/exchange-proxy/sign.ts
const CEX_IDS = [
	"bybit",
	"bingx",
	"okx",
	"bitget",
	"binance"
];
const isCex = (exchange) => CEX_IDS.includes(exchange);
/** Адреса, к которым пускаем: история сделок и права ключа. Ни торговли, ни вывода, ни переводов */
const READ_PATHS = {
	bybit: /* @__PURE__ */ new Set([
		"/v5/position/closed-pnl",
		"/v5/user/query-api",
		"/v5/execution/list",
		"/v5/account/wallet-balance",
		"/v5/asset/transfer/query-account-coins-balance",
		"/v5/earn/position"
	]),
	bingx: /* @__PURE__ */ new Set([
		"/openApi/swap/v2/trade/positionHistory",
		"/openApi/swap/v2/user/income",
		"/openApi/v1/account/apiPermissions",
		"/openApi/spot/v1/account/balance",
		"/openApi/swap/v2/user/balance",
		"/openApi/spot/v1/trade/myTrades"
	]),
	okx: /* @__PURE__ */ new Set([
		"/api/v5/account/positions-history",
		"/api/v5/account/config",
		"/api/v5/public/instruments",
		"/api/v5/account/balance",
		"/api/v5/asset/balances",
		"/api/v5/finance/savings/balance",
		"/api/v5/trade/fills-history"
	]),
	bitget: /* @__PURE__ */ new Set([
		"/api/v2/mix/position/history-position",
		"/api/v3/position/history-position",
		"/api/v3/account/settings",
		"/api/v3/account/info",
		"/api/v2/spot/account/info",
		"/api/v3/account/assets",
		"/api/v2/spot/account/assets",
		"/api/v2/mix/account/accounts",
		"/api/v3/trade/fills",
		"/api/v2/spot/trade/fills"
	]),
	binance: /* @__PURE__ */ new Set([
		"/fapi/v1/income",
		"/fapi/v1/userTrades",
		"/sapi/v1/account/apiRestrictions",
		"/api/v3/account",
		"/sapi/v1/asset/get-funding-asset",
		"/fapi/v2/balance",
		"/sapi/v1/simple-earn/flexible/position",
		"/sapi/v1/simple-earn/locked/position",
		"/api/v3/myTrades"
	])
};
/**
* Единственное исключение из «только GET»: баланс фандинга Binance отдаётся только на POST (это чтение, USER_DATA).
* Подпись и параметры — в адресе, тело пустое, как у GET.
*/
const POST_PATHS = /* @__PURE__ */ new Set(["/sapi/v1/asset/get-funding-asset"]);
/** Какие параметры можно передать бирже (всё остальное отбрасываем) */
const PARAMS = {
	bybit: /* @__PURE__ */ new Set([
		"category",
		"symbol",
		"startTime",
		"endTime",
		"limit",
		"cursor",
		"accountType",
		"coin"
	]),
	bingx: /* @__PURE__ */ new Set([
		"symbol",
		"currency",
		"incomeType",
		"startTime",
		"endTime",
		"limit",
		"pageIndex",
		"pageSize"
	]),
	okx: /* @__PURE__ */ new Set([
		"instType",
		"instId",
		"after",
		"before",
		"limit"
	]),
	bitget: /* @__PURE__ */ new Set([
		"productType",
		"category",
		"symbol",
		"startTime",
		"endTime",
		"limit",
		"idLessThan",
		"cursor"
	]),
	binance: /* @__PURE__ */ new Set([
		"symbol",
		"incomeType",
		"startTime",
		"endTime",
		"limit",
		"fromId",
		"omitZeroBalances",
		"size",
		"current"
	])
};
/** Значения параметров (кроме курсора Bybit) — только безопасные символы: подпись совпадает с адресом без кодирования */
const SAFE_VALUE = /^[A-Za-z0-9_.-]{1,64}$/;
/** Где биржа: у Binance фьючерсы и права ключа — на разных адресах; OKX — три региона (общий, Европа, США) */
function hostsFor(exchange, path) {
	switch (exchange) {
		case "bybit": return ["https://api.bybit.com"];
		case "bingx": return ["https://open-api.bingx.com"];
		case "okx": return [
			"https://www.okx.com",
			"https://eea.okx.com",
			"https://us.okx.com"
		];
		case "bitget": return ["https://api.bitget.com"];
		case "binance": return [path.startsWith("/sapi/") || path.startsWith("/api/") ? "https://api.binance.com" : "https://fapi.binance.com"];
	}
}
/** Параметры → строка запроса Bybit (в том же порядке, в котором её подписываем) */
function buildQuery(params) {
	return Object.entries(params).filter(([k, v]) => PARAMS.bybit.has(k) && (typeof v === "string" || typeof v === "number") && String(v) !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
}
/** Разрешённые параметры биржи → пары [ключ, значение] (по алфавиту, если бирже нужен порядок) */
function pickParams(exchange, params, sorted = false) {
	const out = Object.entries(params ?? {}).filter(([k, v]) => PARAMS[exchange].has(k) && (typeof v === "string" || typeof v === "number") && SAFE_VALUE.test(String(v))).map(([k, v]) => [k, String(v)]);
	return sorted ? out.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0) : out;
}
const joinParams = (pairs) => pairs.map(([k, v]) => `${k}=${v}`).join("&");
async function hmac(secret, payload) {
	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey("raw", enc.encode(secret), {
		name: "HMAC",
		hash: "SHA-256"
	}, false, ["sign"]);
	return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
}
const hmacHex = async (secret, payload) => Array.from(await hmac(secret, payload), (b) => b.toString(16).padStart(2, "0")).join("");
const hmacBase64 = async (secret, payload) => btoa(String.fromCharCode(...await hmac(secret, payload)));
/** Подпись Bybit: HMAC-SHA256(секрет, timestamp + apiKey + recvWindow + queryString) в hex */
const bybitSignature = hmacHex;
/** Адреса Bybit, к которым функция пускает (оставлено для совместимости) */
const BYBIT_READ_PATHS = READ_PATHS.bybit;
/**
* Секрет из Vault → секрет и кодовая фраза.
* Ключи с кодовой фразой (OKX, Bitget) хранятся одной строкой JSON {"s": секрет, "p": фраза} (0018), остальные — как есть.
*/
function parseSecret(stored) {
	if (stored.startsWith("{")) try {
		const o = JSON.parse(stored);
		if (typeof o.s === "string") return {
			secret: o.s,
			passphrase: typeof o.p === "string" ? o.p : null
		};
	} catch {}
	return {
		secret: stored,
		passphrase: null
	};
}
const RECV_WINDOW = "10000";
/** Подписанный GET-запрос к бирже: адрес и заголовки. host — один из hostsFor() */
async function signRequest(exchange, cred, path, params, host = hostsFor(exchange, path)[0], now = Date.now()) {
	if (!READ_PATHS[exchange].has(path)) throw new Error("NOT_ALLOWED");
	const ts = String(now);
	switch (exchange) {
		case "bybit": {
			const query = buildQuery(params);
			const sign = await hmacHex(cred.secret, ts + cred.apiKey + RECV_WINDOW + query);
			return {
				url: `${host}${path}${query ? `?${query}` : ""}`,
				headers: {
					"X-BAPI-API-KEY": cred.apiKey,
					"X-BAPI-TIMESTAMP": ts,
					"X-BAPI-RECV-WINDOW": RECV_WINDOW,
					"X-BAPI-SIGN": sign
				}
			};
		}
		case "bingx": {
			const query = joinParams([...pickParams("bingx", params, true), ["timestamp", ts]]);
			return {
				url: `${host}${path}?${query}&signature=${await hmacHex(cred.secret, query)}`,
				headers: { "X-BX-APIKEY": cred.apiKey }
			};
		}
		case "binance": {
			const query = joinParams([
				...pickParams("binance", params),
				["recvWindow", RECV_WINDOW],
				["timestamp", ts]
			]);
			return {
				url: `${host}${path}?${query}&signature=${await hmacHex(cred.secret, query)}`,
				headers: { "X-MBX-APIKEY": cred.apiKey }
			};
		}
		case "okx": {
			const query = joinParams(pickParams("okx", params));
			const requestPath = `${path}${query ? `?${query}` : ""}`;
			const iso = new Date(now).toISOString();
			const sign = await hmacBase64(cred.secret, iso + "GET" + requestPath);
			return {
				url: `${host}${requestPath}`,
				headers: {
					"OK-ACCESS-KEY": cred.apiKey,
					"OK-ACCESS-SIGN": sign,
					"OK-ACCESS-TIMESTAMP": iso,
					"OK-ACCESS-PASSPHRASE": cred.passphrase ?? ""
				}
			};
		}
		case "bitget": {
			const query = joinParams(pickParams("bitget", params, true));
			const requestPath = `${path}${query ? `?${query}` : ""}`;
			const sign = await hmacBase64(cred.secret, ts + "GET" + requestPath);
			return {
				url: `${host}${requestPath}`,
				headers: {
					"ACCESS-KEY": cred.apiKey,
					"ACCESS-SIGN": sign,
					"ACCESS-TIMESTAMP": ts,
					"ACCESS-PASSPHRASE": cred.passphrase ?? "",
					locale: "en-US",
					"Content-Type": "application/json"
				}
			};
		}
	}
}
/** OKX: «такого ключа нет» — ключ создан в другом регионе (my.okx.com → eea.okx.com, app.okx.com → us.okx.com) */
const okxWrongRegion = (r) => r.json?.code === "50119";
/** На каком адресе OKX нашёлся ключ (на время жизни функции — чтобы не перебирать регионы на каждой странице) */
const okxHost = /* @__PURE__ */ new Map();
/**
* Запрос к бирже с подписью. Для OKX — сам находит регион ключа.
* Ошибки сети пробрасываются; ответ с ошибкой биржи (4xx с JSON) возвращается как есть — его разбирает модуль биржи.
*/
async function callExchange(exchange, cred, path, params, fetchFn = fetch) {
	const all = hostsFor(exchange, path);
	const known = exchange === "okx" ? okxHost.get(cred.apiKey) : void 0;
	const hosts = known ? [known, ...all.filter((h) => h !== known)] : all;
	let reply = null;
	for (const host of hosts) {
		const { url, headers } = await signRequest(exchange, cred, path, params, host);
		const res = await fetchFn(url, {
			method: POST_PATHS.has(path) ? "POST" : "GET",
			headers
		});
		const text = await res.text();
		let json = null;
		try {
			json = JSON.parse(text);
		} catch {}
		reply = {
			status: res.status,
			json,
			text
		};
		if (exchange !== "okx" || !okxWrongRegion(reply)) {
			if (exchange === "okx") okxHost.set(cred.apiKey, host);
			return reply;
		}
	}
	return reply;
}

// src/lib/portfolio/wallets.ts
const EVM_CHAINS = [
	{
		id: "ethereum",
		rpc: "https://ethereum-rpc.publicnode.com",
		native: "ETH"
	},
	{
		id: "arbitrum-one",
		rpc: "https://arbitrum-one-rpc.publicnode.com",
		native: "ETH"
	},
	{
		id: "base",
		rpc: "https://base-rpc.publicnode.com",
		native: "ETH"
	},
	{
		id: "optimistic-ethereum",
		rpc: "https://optimism-rpc.publicnode.com",
		native: "ETH"
	},
	{
		id: "binance-smart-chain",
		rpc: "https://bsc-rpc.publicnode.com",
		native: "BNB"
	},
	{
		id: "polygon-pos",
		rpc: "https://polygon-bor-rpc.publicnode.com",
		native: "POL"
	}
];
const SOLANA_RPC = "https://solana-rpc.publicnode.com";
const TOKEN_PROGRAMS = ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"];
/** Запросов в одной пачке JSON-RPC (публичные узлы режут большие пачки) */
const BATCH = 40;
const isEvmAddress = (a) => /^0x[0-9a-f]{40}$/.test(a);
const isSolanaAddress = (a) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a);
/**
* Пачка JSON-RPC → ответы по порядку. Ошибка сети / узла — исключение; ошибка одного запроса — тоже,
* а с soft = true — null на его месте (контракт монеты отказал — не повод терять весь кошелёк).
*/
async function rpcBatch(url, reqs, fetchFn = fetch, soft = false) {
	const out = [];
	for (let i = 0; i < reqs.length; i += BATCH) {
		const part = reqs.slice(i, i + BATCH);
		const res = await fetchFn(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(part.map((r, k) => ({
				jsonrpc: "2.0",
				id: k,
				method: r.method,
				params: r.params
			})))
		});
		if (!res.ok) throw new Error(`RPC_HTTP_${res.status} network`);
		const body = await res.json();
		const byId = new Map((Array.isArray(body) ? body : [body]).map((x) => [x.id, x]));
		for (let k = 0; k < part.length; k++) {
			const r = byId.get(k);
			if (r && !r.error) out.push(r.result);
			else if (soft && r && /revert/i.test(String(r.error?.message ?? ""))) out.push(null);
			else throw new Error(`RPC_ERROR ${r?.error?.message ?? "no answer"} network`);
		}
	}
	return out;
}
const hexToBig = (v) => typeof v === "string" && /^0x[0-9a-f]*$/i.test(v) && v.length > 2 ? BigInt(v.slice(0, 66)) : 0n;
/** Целое число в мельчайших единицах → обычное (10^decimals) */
function units(raw, decimals) {
	if (raw <= 0n) return 0;
	const d = BigInt(10) ** BigInt(Math.min(Math.max(decimals, 0), 36));
	return Number(raw / d) + Number(raw % d) / Number(d);
}
const pad = (addr) => addr.slice(2).padStart(64, "0");
/** Монеты одной сети: адрес контракта → символ (у одного контракта — монета с большей капитализацией, она в списке раньше) */
function tokensOn(chain, coins) {
	const out = /* @__PURE__ */ new Map();
	for (const c of coins) {
		const addr = c.platforms?.[chain];
		if (addr && !out.has(addr)) out.set(addr, c.symbol);
	}
	return out;
}
/** Одна сеть EVM: родная монета + токены из нашего списка */
async function evmChainBalances(chain, address, coins, fetchFn = fetch) {
	const tokens = [...tokensOn(chain.id, coins)];
	const first = await rpcBatch(chain.rpc, [{
		method: "eth_getBalance",
		params: [address, "latest"]
	}, ...tokens.map(([contract]) => ({
		method: "eth_call",
		params: [{
			to: contract,
			data: `0x70a08231${pad(address)}`
		}, "latest"]
	}))], fetchFn, true);
	if (first[0] === null) throw new Error(`RPC_ERROR ${chain.id} balance network`);
	const out = [];
	const native = units(hexToBig(first[0]), 18);
	if (native > 0) out.push({
		account: "wallet",
		symbol: chain.native,
		amount: native
	});
	const held = tokens.map(([contract, symbol], i) => ({
		contract,
		symbol,
		raw: hexToBig(first[i + 1])
	})).filter((x) => x.raw > 0n);
	if (!held.length) return out;
	const decs = await rpcBatch(chain.rpc, held.map((x) => ({
		method: "eth_call",
		params: [{
			to: x.contract,
			data: "0x313ce567"
		}, "latest"]
	})), fetchFn, true);
	held.forEach((x, i) => {
		if (decs[i] === null) return;
		const d = Number(hexToBig(decs[i]));
		const amount = units(x.raw, d <= 36 ? d : 18);
		if (amount > 0) out.push({
			account: "wallet",
			symbol: x.symbol,
			amount
		});
	});
	return out;
}
/** Все сети EVM одним адресом (сети спрашиваем одновременно) */
async function evmBalances(address, coins, fetchFn = fetch) {
	const addr = address.toLowerCase();
	if (!isEvmAddress(addr)) throw new Error("BAD_WALLET");
	return (await Promise.all(EVM_CHAINS.map((c) => evmChainBalances(c, addr, coins, fetchFn)))).flat();
}
/** Solana: SOL + токены из нашего списка (по адресу mint) */
async function solanaBalances(address, coins, fetchFn = fetch) {
	if (!isSolanaAddress(address)) throw new Error("BAD_WALLET");
	const [bal, ...programs] = await rpcBatch(SOLANA_RPC, [{
		method: "getBalance",
		params: [address]
	}, ...TOKEN_PROGRAMS.map((programId) => ({
		method: "getTokenAccountsByOwner",
		params: [
			address,
			{ programId },
			{ encoding: "jsonParsed" }
		]
	}))], fetchFn);
	const out = [];
	const lamports = Number(bal?.value ?? 0);
	if (Number.isFinite(lamports) && lamports > 0) out.push({
		account: "wallet",
		symbol: "SOL",
		amount: lamports / 1e9
	});
	const mints = tokensOn("solana", coins);
	for (const p of programs) for (const a of p?.value ?? []) {
		const info = a.account?.data?.parsed?.info;
		const symbol = typeof info?.mint === "string" ? mints.get(info.mint) : void 0;
		const amount = units(typeof info?.tokenAmount?.amount === "string" && /^\d{1,40}$/.test(info.tokenAmount.amount) ? BigInt(info.tokenAmount.amount) : 0n, Number(info?.tokenAmount?.decimals ?? 0));
		if (symbol && amount > 0) out.push({
			account: "wallet",
			symbol,
			amount
		});
	}
	return out;
}

// src/lib/calc/portfolio.ts
/** Стейблкоины: цена входа по умолчанию — 1 $ */
/** Стейблкоины (тот же список — STABLE_SYMBOLS в prices-worker/platforms.ts: держат привязку ±0,5 % — цена ровно 1 $) */
const STABLES = /* @__PURE__ */ new Set([
	"USDT",
	"USDC",
	"DAI",
	"FDUSD",
	"TUSD",
	"USDE",
	"PYUSD",
	"USDD",
	"BUSD",
	"USD1",
	"RLUSD"
]);

// src/lib/portfolio/balances.ts
/**
* Портфель: балансы подключённой биржи / кошелька → строки holdings (0019).
* Общий код для браузера (через exchange-proxy) и сервера (sync-worker, Pro Plus): запросы приходят снаружи (deps).
*
* Правила:
*  - ТОЛЬКО СПОТ (владелец 18.11.2026, как у Bybit «Обзор активов», Delta, CoinStats: портфель — монеты, фьючерсы отдельно):
*    спот, фандинг и Earn складываем; фьючерсные счета (Binance USDⓈ-M, Bitget mix, BingX swap) и перпы Hyperliquid не берём;
*    на ЕДИНОМ торговом счёте (Bybit UTA, OKX trading, Bitget UTA) спот и фьючерсы в одном кошельке — стейблкоины там
*    это маржа фьючерсов, их не считаем (spotOnlyUnified), монеты — по балансу без нереализованного PnL фьючерсов;
*  - не задваиваем: у Binance активы «LD…» в споте — это Simple Earn, их берём из Earn;
*  - основной счёт не ответил — ошибка (старые балансы остаются, график не «падает»); дополнительный (фандинг, Earn) не ответил —
*    просто без него;
*  - символы — заглавными, только буквы / цифры; нули и отрицательные (заём) отбрасываем.
*/
const n$1 = (v) => {
	const x = typeof v === "number" ? v : typeof v === "string" && v !== "" ? Number(v) : NaN;
	return Number.isFinite(x) ? x : 0;
};
const arr = (v) => Array.isArray(v) ? v : [];
/** Обёртки Hyperliquid (UBTC, UETH…) — это те же монеты */
const ALIASES = {
	UBTC: "BTC",
	UETH: "ETH",
	USOL: "SOL",
	USDT0: "USDT"
};
/** Символ биржи → наш (BTC); мусор — null */
function cleanSymbol(raw) {
	if (typeof raw !== "string") return null;
	const s = raw.trim().toUpperCase();
	const out = ALIASES[s] ?? s;
	return /^[A-Z0-9._-]{1,24}$/.test(out) ? out : null;
}
/** Одинаковые (счёт, монета) — в одну строку; нули и заём — прочь */
function mergeBalances(list) {
	const map = /* @__PURE__ */ new Map();
	for (const b of list) {
		const symbol = cleanSymbol(b.symbol);
		if (!symbol) continue;
		const key = `${b.account}|${symbol}`;
		const prev = map.get(key);
		if (prev) {
			prev.amount += b.amount;
			if (b.value_usd != null) prev.value_usd = (prev.value_usd ?? 0) + b.value_usd;
		} else map.set(key, {
			...b,
			symbol
		});
	}
	return [...map.values()].filter((b) => b.amount > 1e-12 || (b.value_usd ?? 0) > 0);
}
/**
* Единый торговый счёт (спот + фьючерсы в одном кошельке): стейблкоины на нём — маржа фьючерсов, в спотовый портфель не идут.
* Монеты (купленные на споте) остаются. Стейблкоины на фандинге и в Earn считаются — это отдельные счета
*/
function spotOnlyUnified(list) {
	return list.filter((b) => !STABLES.has(cleanSymbol(b.symbol) ?? ""));
}
/**
* Ошибка временная (сеть, биржа «лежит», частота запросов, неизвестная) — тогда НЕ притворяемся, что счёт пустой:
* иначе на час из портфеля выпадут деньги фандинга / Earn и на графике будет ложный провал (аудит 19.11.2026).
* Постоянная — биржа ответила отказом по этому счёту (нет прав ключа, продукт недоступен): счёта просто нет.
*/
function isTransient(e) {
	if (e instanceof BybitError) return e.code === 10006 || e.code === 10018 || e.code === 10016 || e.code === 1e4;
	if (e instanceof ExchangeError) return e.kind === "RATE_LIMIT";
	return true;
}
/**
* Дополнительный счёт (фандинг, Earn): отказ биржи — пусто; временная ошибка — ошибка всего обновления,
* старые балансы остаются (как при сбое основного счёта)
*/
async function optional(fn) {
	try {
		return await fn();
	} catch (e) {
		if (isTransient(e)) throw e;
		return [];
	}
}
async function bybitResult(call, path, params) {
	const r = await call(path, params);
	if (!r || r.retCode !== 0) throw new BybitError(r?.retCode ?? -1, r?.retMsg ?? "no response");
	return r.result;
}
async function bybitBalances(call) {
	const c = call;
	const unified = await bybitResult(c, "/v5/account/wallet-balance", { accountType: "UNIFIED" });
	const out = spotOnlyUnified(arr(unified.list?.[0]?.coin).map((x) => ({
		account: "spot",
		symbol: String(x.coin),
		amount: n$1(x.walletBalance ?? x.equity)
	})));
	out.push(...await optional(async () => {
		const fund = await bybitResult(c, "/v5/asset/transfer/query-account-coins-balance", { accountType: "FUND" });
		return arr(fund.balance).map((x) => ({
			account: "fund",
			symbol: String(x.coin),
			amount: n$1(x.walletBalance)
		}));
	}));
	for (const category of ["FlexibleSaving", "OnChain"]) out.push(...await optional(async () => {
		const earn = await bybitResult(c, "/v5/earn/position", { category });
		return arr(earn.list).map((x) => ({
			account: "earn",
			symbol: String(x.coin),
			amount: n$1(x.amount)
		}));
	}));
	return mergeBalances(out);
}
async function binanceBalances(call) {
	const spot = await binanceGet(call, "/api/v3/account", { omitZeroBalances: "true" });
	const out = arr(spot.balances).filter((x) => !/^LD[A-Z0-9]{2,}$/.test(String(x.asset))).map((x) => ({
		account: "spot",
		symbol: String(x.asset),
		amount: n$1(x.free) + n$1(x.locked)
	}));
	out.push(...await optional(async () => arr(await binanceGet(call, "/sapi/v1/asset/get-funding-asset", {})).map((x) => ({
		account: "fund",
		symbol: String(x.asset),
		amount: n$1(x.free) + n$1(x.locked) + n$1(x.freeze) + n$1(x.withdrawing)
	}))), ...await optional(async () => arr((await binanceGet(call, "/sapi/v1/simple-earn/flexible/position", { size: 100 })).rows).map((x) => ({
		account: "earn",
		symbol: String(x.asset),
		amount: n$1(x.totalAmount)
	}))), ...await optional(async () => arr((await binanceGet(call, "/sapi/v1/simple-earn/locked/position", { size: 100 })).rows).map((x) => ({
		account: "earn",
		symbol: String(x.asset),
		amount: n$1(x.amount)
	}))));
	return mergeBalances(out);
}
async function okxBalances(call) {
	const trading = await okxGet(call, "/api/v5/account/balance", {});
	let spotMode = false;
	try {
		spotMode = String((await okxGet(call, "/api/v5/account/config", {}))[0]?.acctLv) === "1";
	} catch (e) {
		if (isTransient(e)) throw e;
	}
	const coins = arr(trading[0]?.details).map((x) => ({
		account: "spot",
		symbol: String(x.ccy),
		amount: n$1(x.cashBal ?? x.eq)
	}));
	const out = spotMode ? coins : spotOnlyUnified(coins);
	out.push(...await optional(async () => (await okxGet(call, "/api/v5/asset/balances", {})).map((x) => ({
		account: "fund",
		symbol: String(x.ccy),
		amount: n$1(x.bal)
	}))), ...await optional(async () => (await okxGet(call, "/api/v5/finance/savings/balance", {})).map((x) => ({
		account: "earn",
		symbol: String(x.ccy),
		amount: n$1(x.amt)
	}))));
	return mergeBalances(out);
}
async function bitgetBalances(call) {
	const uta = await call("/api/v3/account/assets", {});
	if (uta?.code === "00000") return mergeBalances(spotOnlyUnified(arr(uta.data?.assets).map((x) => ({
		account: "spot",
		symbol: String(x.coin),
		amount: n$1(x.balance ?? x.equity)
	}))));
	const spot = await bitgetGet(call, "/api/v2/spot/account/assets", {});
	return mergeBalances(arr(spot).map((x) => ({
		account: "spot",
		symbol: String(x.coin),
		amount: n$1(x.available) + n$1(x.frozen) + n$1(x.locked)
	})));
}
async function bingxBalances(call) {
	const spot = await bingxGet(call, "/openApi/spot/v1/account/balance", {});
	return mergeBalances(arr(spot.balances).map((x) => ({
		account: "spot",
		symbol: String(x.asset),
		amount: n$1(x.free) + n$1(x.locked)
	})));
}
async function hyperliquidBalances(address, fetchFn = fetch) {
	const post = async (type) => {
		const res = await fetchFn(HL_API, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				type,
				user: address
			})
		});
		if (!res.ok) throw new Error(`HL_HTTP_${res.status} network`);
		return await res.json();
	};
	const spot = await post("spotClearinghouseState");
	return mergeBalances(arr(spot.balances).map((x) => ({
		account: "spot",
		symbol: String(x.coin),
		amount: n$1(x.total)
	})));
}
/** Открытые позиции по текущей цене исхода — одной строкой «POLYMARKET» со стоимостью в $ */
async function polymarketBalances(get, address) {
	let total = 0;
	let cursor = "";
	for (let page = 0; page < 20; page++) {
		const res = await get("/v2/positions", {
			user: address,
			status: "OPEN",
			limit: 100,
			...cursor ? { cursor } : {}
		});
		const r = res ?? {};
		const items = Array.isArray(res) ? res : arr(r.data ?? r.positions);
		for (const p of items) {
			const value = n$1(p.current_value ?? p.currentValue);
			total += value > 0 ? value : n$1(p.total_size ?? p.size) * n$1(p.cur_price ?? p.curPrice);
		}
		const pag = r.pagination ?? {};
		const next = typeof pag.next_cursor === "string" ? pag.next_cursor : "";
		if (!next || !items.length) break;
		cursor = next;
	}
	return total > 0 ? [{
		account: "prediction",
		symbol: "POLYMARKET",
		amount: total,
		value_usd: Math.round(total * 100) / 100
	}] : [];
}
/** Балансы одного подключения */
async function fetchBalances(conn, deps) {
	switch (conn.exchange) {
		case "bybit": return bybitBalances(deps.cexCall);
		case "binance": return binanceBalances(deps.cexCall);
		case "okx": return okxBalances(deps.cexCall);
		case "bitget": return bitgetBalances(deps.cexCall);
		case "bingx": return bingxBalances(deps.cexCall);
		case "hyperliquid": return hyperliquidBalances(conn.api_key, deps.fetchFn);
		case "polymarket": return polymarketBalances(deps.polymarketGet ?? pmDirectGet(deps.fetchFn), conn.api_key);
		case "evm": return mergeBalances(await evmBalances(conn.api_key, deps.coins ?? [], deps.fetchFn));
		case "solana": return mergeBalances(await solanaBalances(conn.api_key, deps.coins ?? [], deps.fetchFn));
		default: return [];
	}
}

// src/lib/portfolio/fills.ts
/**
* Портфель, этап 2 (0020): история спотовых покупок / продаж с бирж → исполнения spot_fills.
* Из них считается средняя цена входа и зафиксированная прибыль (lib/calc/portfolio.ts → costBasis).
* Общий код для браузера (через exchange-proxy) и сервера (sync-worker): запросы приходят снаружи (CexCall), только чтение.
*
*  - Bybit: /v5/execution/list?category=spot — окна по 7 дней, первый раз за 2 года;
*  - Binance: /api/v3/myTrades — по парам монет, которые сейчас на балансе (к USDT / USDC / FDUSD), с первой сделки по номерам;
*  - OKX: /api/v5/trade/fills-history?instType=SPOT — последние 3 месяца (больше OKX не хранит);
*  - Bitget: единый аккаунт — /api/v3/trade/fills?category=SPOT (окна по 30 дней), классический — /api/v2/spot/trade/fills; 90 дней;
*  - BingX: /openApi/spot/v1/trade/myTrades — по парам монет с баланса, только последние 7 дней (дальше копится с каждой загрузкой);
*  - Hyperliquid: userFillsByTime по адресу (спот — монеты «@N» и «PURR/USDC», названия из spotMeta), последние 10 000 исполнений.
* Повторы безопасны: в базе unique (подключение, external_id), поэтому следующая загрузка берёт с запасом в сутки.
*/
/** Валюты котировки, по которым узнаём пару BTCUSDT → BTC / USDT (длинные — первыми) */
const QUOTES = [
	"FDUSD",
	"USDT",
	"USDC",
	"USDE",
	"TUSD",
	"BUSD",
	"USD1",
	"DAI",
	"EUR",
	"TRY",
	"BTC",
	"ETH",
	"BNB",
	"USD"
];
/** Котировки, которые считаем равными доллару — только по ним считается цена входа */
const USD_QUOTES = /* @__PURE__ */ new Set([
	"USDT",
	"USDC",
	"FDUSD",
	"USDE",
	"TUSD",
	"BUSD",
	"USD1",
	"DAI",
	"USD"
]);
const n = (v) => {
	const x = typeof v === "number" ? v : typeof v === "string" && v !== "" ? Number(v) : NaN;
	return Number.isFinite(x) ? x : 0;
};
const clean = (s) => typeof s === "string" ? s.trim().toUpperCase() : "";
const okSym = (s) => /^[A-Z0-9._-]{1,24}$/.test(s);
/** BTCUSDT / BTC-USDT / BTC_USDT → { asset: BTC, quote: USDT } */
function splitPair(symbol) {
	const s = clean(symbol);
	const parts = s.split(/[-_/]/);
	if (parts.length === 2 && okSym(parts[0]) && okSym(parts[1])) return {
		asset: parts[0],
		quote: parts[1]
	};
	for (const q of QUOTES) if (s.endsWith(q) && s.length > q.length && okSym(s.slice(0, -q.length))) return {
		asset: s.slice(0, -q.length),
		quote: q
	};
	return null;
}
function fill(id, pair, side, qty, price, fee, feeAsset, ts) {
	const q = n(qty);
	const p = n(price);
	const t = n(ts);
	const sd = String(side).toLowerCase();
	if (!pair || q <= 0 || p <= 0 || t <= 0 || sd !== "buy" && sd !== "sell") return null;
	const fa = clean(feeAsset);
	return {
		external_id: id.slice(0, 120),
		asset: pair.asset,
		quote: pair.quote,
		side: sd,
		qty: q,
		price: p,
		fee: Math.abs(n(fee)),
		fee_asset: okSym(fa) ? fa : null,
		at: new Date(t < 0xe8d4a51000 ? t * 1e3 : t).toISOString()
	};
}
const only = (xs) => xs.filter((x) => x !== null);
const BYBIT_SPOT_DAYS = 730;
async function bybitSpotFills(call, from, to) {
	const c = call;
	const out = [];
	await inBatches(windows(from, to, 7 * DAY), 4, async ([start, end]) => {
		let cursor = "";
		for (let page = 0; page < 50; page++) {
			const r = await c("/v5/execution/list", {
				category: "spot",
				startTime: start,
				endTime: end,
				limit: 100,
				...cursor ? { cursor } : {}
			});
			if (!r || r.retCode !== 0) throw new BybitError(r?.retCode ?? -1, r?.retMsg ?? "no response");
			const res = r.result;
			for (const x of res.list ?? []) {
				const pair = splitPair(String(x.symbol));
				const buy = String(x.side) === "Buy";
				out.push(...only([fill(`bb:${x.execId}`, pair, buy ? "buy" : "sell", x.execQty, x.execPrice, x.execFee, x.feeCurrency || (buy ? pair?.asset : pair?.quote), x.execTime)]));
			}
			cursor = res.nextPageCursor ?? "";
			if (!cursor || !(res.list ?? []).length) break;
		}
	});
	return out;
}
const BINANCE_QUOTES = [
	"USDT",
	"USDC",
	"FDUSD"
];
/**
* assets — монеты на балансе (у Binance история сделок — только по конкретной паре, поэтому собираем пары к USDT / USDC / FDUSD).
* from = null — вся история (по номерам сделок с нуля); иначе — последние 1000 сделок пары, а если и они все новее from —
* всё равно вся история (у Binance «с такого-то времени» ограничено сутками).
*/
async function binanceSpotFills(call, assets, from) {
	const out = [];
	const symbols = [...new Set(assets.map(clean))].filter((a) => okSym(a) && !USD_QUOTES.has(a)).flatMap((a) => BINANCE_QUOTES.map((q) => ({
		symbol: a + q,
		pair: {
			asset: a,
			quote: q
		}
	})));
	const get = async (symbol, extra) => {
		try {
			const rows = await binanceGet(call, "/api/v3/myTrades", {
				symbol,
				limit: 1e3,
				...extra
			});
			return Array.isArray(rows) ? rows : [];
		} catch (e) {
			if (e instanceof ExchangeError && e.kind === "EXCHANGE") return null;
			throw e;
		}
	};
	const add = (symbol, pair, rows) => {
		for (const x of rows) out.push(...only([fill(`bn:${symbol}:${x.id}`, pair, x.isBuyer ? "buy" : "sell", x.qty, x.price, x.commission, x.commissionAsset, x.time)]));
	};
	await inBatches(symbols, 3, async ({ symbol, pair }) => {
		if (from !== null) {
			const latest = await get(symbol, {});
			if (latest === null) return;
			if (latest.length < 1e3 || Math.min(...latest.map((x) => n(x.time))) <= from) {
				add(symbol, pair, latest.filter((x) => n(x.time) >= from));
				return;
			}
		}
		let fromId = 0;
		for (let page = 0; page < 100; page++) {
			const rows = await get(symbol, { fromId });
			if (!rows || !rows.length) return;
			add(symbol, pair, rows);
			if (rows.length < 1e3) return;
			fromId = Math.max(...rows.map((x) => n(x.id))) + 1;
		}
	});
	return out;
}
async function okxSpotFills(call, from) {
	const out = [];
	let after = "";
	for (let page = 0; page < 200; page++) {
		const rows = await okxGet(call, "/api/v5/trade/fills-history", {
			instType: "SPOT",
			limit: 100,
			...after ? { after } : {}
		});
		if (!rows.length) break;
		for (const x of rows) out.push(...only([fill(`ok:${x.tradeId}:${x.billId}`, splitPair(String(x.instId)), x.side, x.fillSz, x.fillPx, x.fee, x.feeCcy, x.ts)]));
		const oldest = Math.min(...rows.map((x) => n(x.ts)));
		after = String(rows[rows.length - 1].billId ?? "");
		if (rows.length < 100 || oldest < from || !after) break;
	}
	return out.filter((f) => Date.parse(f.at) >= from);
}
const BITGET_DAYS = 90;
/** Комиссия Bitget: у классического — объект {feeCoin, totalFee}, у единого — массив [{feeCoin, fee}] (знак — минус) */
function bitgetFee(d) {
	if (Array.isArray(d)) {
		const x = d.find((f) => n(f.fee) !== 0) ?? d[0];
		return {
			fee: n(x?.fee),
			coin: x?.feeCoin
		};
	}
	const o = d ?? {};
	return {
		fee: n(o.totalFee),
		coin: o.feeCoin
	};
}
async function bitgetSpotFills(call, from, to) {
	const out = [];
	const add = (x, id, price, qty, ts) => {
		const f = bitgetFee(x.feeDetail);
		out.push(...only([fill(`bg:${id}`, splitPair(String(x.symbol)), x.side, qty, price, f.fee, f.coin, ts)]));
	};
	if ((await call("/api/v3/trade/fills", {
		category: "SPOT",
		startTime: Math.max(from, to - 30 * 864e5),
		endTime: to,
		limit: 100
	}))?.code === "00000") {
		for (const [start, end] of windows(from, to, 30 * DAY)) {
			let cursor = "";
			for (let page = 0; page < 100; page++) {
				const d = await bitgetGet(call, "/api/v3/trade/fills", {
					category: "SPOT",
					startTime: start,
					endTime: end,
					limit: 100,
					...cursor ? { cursor } : {}
				});
				const list = d?.list ?? [];
				for (const x of list) add(x, x.execId, x.execPrice, x.execQty, x.createdTime);
				if (list.length < 100 || !d.cursor || d.cursor === cursor) break;
				cursor = String(d.cursor);
			}
		}
		return out;
	}
	let idLessThan = "";
	for (let page = 0; page < 200; page++) {
		const rows = await bitgetGet(call, "/api/v2/spot/trade/fills", {
			startTime: from,
			endTime: to,
			limit: 100,
			...idLessThan ? { idLessThan } : {}
		});
		const list = Array.isArray(rows) ? rows : [];
		for (const x of list) add(x, x.tradeId, x.priceAvg, x.size, x.cTime);
		if (list.length < 100) break;
		const last = String(list[list.length - 1].tradeId ?? "");
		if (!last || last === idLessThan) break;
		idLessThan = last;
	}
	return out;
}
const BINGX_DAYS = 7;
const BINGX_QUOTES = ["USDT", "USDC"];
/** История BingX — только по паре (BTC-USDT) и только за 7 дней; пары — из монет на балансе */
async function bingxSpotFills(call, assets, from, to) {
	const out = [];
	const symbols = [...new Set(assets.map(clean))].filter((a) => okSym(a) && !USD_QUOTES.has(a)).flatMap((a) => BINGX_QUOTES.map((q) => ({
		asset: a,
		quote: q
	})));
	await inBatches(symbols, 3, async (pair) => {
		const symbol = `${pair.asset}-${pair.quote}`;
		let start = from;
		for (let page = 0; page < 20; page++) {
			let rows;
			try {
				const d = await bingxGet(call, "/openApi/spot/v1/trade/myTrades", {
					symbol,
					startTime: start,
					endTime: to,
					limit: 1e3
				});
				rows = Array.isArray(d?.fills) ? d.fills : [];
			} catch (e) {
				if (e instanceof ExchangeError && e.kind === "EXCHANGE") return;
				throw e;
			}
			for (const x of rows) out.push(...only([fill(`bx:${symbol}:${x.id}`, pair, x.isBuyer ? "buy" : "sell", x.qty, x.price, x.commission, x.commissionAsset, x.time)]));
			if (rows.length < 1e3) return;
			const next = Math.max(...rows.map((x) => n(x.time)));
			if (next <= start) return;
			start = next;
		}
	});
	return out;
}
/** «@107» / «PURR/USDC» → монета и котировка по spotMeta (обёртки UBTC, UETH → BTC, ETH — как в балансах) */
function hlSpotPairs(meta) {
	const tokens = new Map((meta.tokens ?? []).map((t) => [t.index, t.name ?? ""]));
	const out = /* @__PURE__ */ new Map();
	for (const u of meta.universe ?? []) {
		const [b, q] = u.tokens ?? [];
		const asset = cleanSymbol(tokens.get(b));
		const quote = cleanSymbol(tokens.get(q));
		if (!asset || !quote) continue;
		const pair = {
			asset,
			quote
		};
		if (u.name) out.set(u.name, pair);
		if (u.index !== void 0) out.set(`@${u.index}`, pair);
	}
	return out;
}
async function hyperliquidSpotFills(address, from, fetchFn = fetch) {
	const res = await fetchFn(HL_API, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ type: "spotMeta" })
	});
	if (!res.ok) throw new Error(`HL_HTTP_${res.status} network`);
	const pairs = hlSpotPairs(await res.json());
	const fills = await fetchHlFills(address, from, fetchFn);
	return only(fills.filter((f) => f.coin.startsWith("@") || f.coin.includes("/")).map((f) => fill(`hl:${f.tid}`, pairs.get(f.coin) ?? null, f.side === "B" ? "buy" : "sell", f.sz, f.px, f.fee, cleanSymbol(f.feeToken ?? "USDC"), f.time)));
}
/**
* Новые исполнения подключения с прошлого раза (cursor — ISO или null: первый раз — вся доступная история).
* Возвращает исполнения и новый курсор (сейчас) или null, если биржа историю спота не отдаёт.
* call — запросы к бирже с ключом (exchange-proxy / sync-worker); Hyperliquid — по адресу (api_key), напрямую через fetchFn.
*/
async function fetchSpotFills(conn, call, opts) {
	const now = opts.now ?? Date.now();
	const since = opts.cursor ? Date.parse(opts.cursor) - DAY : null;
	const back = (days) => Math.max(since ?? 0, now - days * DAY);
	let fills;
	switch (conn.exchange) {
		case "bybit":
			fills = await bybitSpotFills(call, back(730), now);
			break;
		case "binance":
			fills = await binanceSpotFills(call, opts.assets, since);
			break;
		case "okx":
			fills = await okxSpotFills(call, back(90));
			break;
		case "bitget":
			fills = await bitgetSpotFills(call, back(BITGET_DAYS), now);
			break;
		case "bingx":
			fills = await bingxSpotFills(call, opts.assets, back(BINGX_DAYS), now);
			break;
		case "hyperliquid":
			if (!conn.api_key) return null;
			fills = await hyperliquidSpotFills(conn.api_key, since ?? 0, opts.fetchFn);
			break;
		default: return null;
	}
	return {
		fills: [...new Map(fills.map((f) => [f.external_id, f])).values()],
		cursor: new Date(now).toISOString()
	};
}

// src/lib/import/twins.ts
const TWIN_WINDOW_MS = 18e4;
/** Позиция дольше этого — кусками не сравниваем (окно поиска было бы слишком большим) */
const MAX_POSITION_MS = 7776e6;
const close = (a, b, rel = .001) => a !== null && b !== null && Math.abs(a - b) <= Math.max(.02, Math.abs(a) * rel);
const toItem = (r) => {
	const t = Date.parse(r.exit_at);
	if (!Number.isFinite(t)) return null;
	const o = r.entry_at ? Date.parse(r.entry_at) : NaN;
	return {
		id: r.external_id,
		t,
		open: Number.isFinite(o) && o < t && t - o <= MAX_POSITION_MS ? o : null,
		sym: r.symbol.toUpperCase(),
		side: r.side,
		pnl: r.pnl,
		used: false
	};
};
/**
* Куски внутри целой сделки, последний — в момент её закрытия, сумма PnL = PnL целой.
* Берём последние k кусков (частичные закрытия идут подряд перед полным): k = 2, 3, … пока сумма не сойдётся.
*/
function piecesOf(whole, pool) {
	if (whole.open === null || whole.pnl === null) return null;
	const inside = pool.filter((p) => !p.used && p.sym === whole.sym && p.side === whole.side && p.pnl !== null && p.t >= whole.open - 18e4 && p.t <= whole.t + 18e4).sort((a, b) => a.t - b.t);
	if (inside.length < 2 || Math.abs(inside[inside.length - 1].t - whole.t) > 18e4) return null;
	let sum = 0;
	for (let k = 1; k <= inside.length; k++) {
		sum += inside[inside.length - k].pnl;
		if (k >= 2 && close(whole.pnl, sum, .002)) return inside.slice(inside.length - k);
	}
	return null;
}
/** external_id новых сделок, у которых уже есть записанный двойник (с другим номером или кусками) */
function findTwins(trades, existing) {
	const out = /* @__PURE__ */ new Set();
	const ids = new Set(trades.map((t) => t.external_id));
	const pool = existing.filter((r) => !r.external_id || !ids.has(r.external_id)).map(toItem).filter((x) => x !== null);
	const fresh = trades.map(toItem).filter((x) => x !== null);
	for (const n of fresh) {
		const hit = pool.find((r) => !r.used && r.sym === n.sym && r.side === n.side && Math.abs(r.t - n.t) <= 18e4 && close(r.pnl, n.pnl));
		if (hit) {
			hit.used = true;
			n.used = true;
			out.add(n.id);
		}
	}
	for (const whole of pool) {
		if (whole.used) continue;
		const pieces = piecesOf(whole, fresh);
		if (!pieces) continue;
		whole.used = true;
		for (const p of pieces) {
			p.used = true;
			out.add(p.id);
		}
	}
	for (const whole of fresh) {
		if (whole.used) continue;
		const pieces = piecesOf(whole, pool);
		if (!pieces) continue;
		for (const p of pieces) p.used = true;
		whole.used = true;
		out.add(whole.id);
	}
	return out;
}
/** Окно времени, в котором искать двойников у этих сделок (от самого раннего открытия; null — сделок нет) */
function twinRange(trades) {
	const ts = trades.map((t) => Date.parse(t.exit_at)).filter(Number.isFinite);
	if (!ts.length) return null;
	const opens = trades.map((t) => t.entry_at ? Date.parse(t.entry_at) : NaN).filter((x) => Number.isFinite(x));
	const from = Math.min(...ts, ...opens.filter((o) => Math.min(...ts) - o <= MAX_POSITION_MS)) - TWIN_WINDOW_MS;
	return {
		from: new Date(from).toISOString(),
		to: new Date(Math.max(...ts) + MAX_POSITION_MS + TWIN_WINDOW_MS).toISOString()
	};
}

export { READ_PATHS, SyncError, buildQuery, bybitSignature, callExchange, fetchBalances, fetchSpotFills, findTwins, isCex, parseSecret, runSync, toSyncError, twinRange };