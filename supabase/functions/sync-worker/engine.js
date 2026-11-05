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
const num$1 = (s) => s === void 0 || s === "" ? null : Number(s);
/** Одна закрытая позиция Bybit → сделка для дневника (null — если данные неполные) */
function bybitClosedToTrade(item, category) {
	const symbol = normalizeSymbol(item.symbol);
	const entry = num$1(item.avgEntryPrice);
	const exit = num$1(item.avgExitPrice);
	const pnlRaw = num$1(item.closedPnl);
	const time = num$1(item.updatedTime) ?? num$1(item.createdTime);
	if (!symbol || !entry || !exit || entry <= 0 || exit <= 0 || pnlRaw === null || !time) return null;
	const side = item.side === "Sell" ? "long" : "short";
	const market = category;
	const size = market === "inverse" ? num$1(item.closedSize) : num$1(item.cumEntryValue);
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
	const openFee = num$1(item.openFee);
	const closeFee = num$1(item.closeFee);
	if (openFee !== null && closeFee !== null) {
		fee = round(toUsd(Math.abs(openFee) + Math.abs(closeFee)), 8);
		funding = round(pnl - (gross - fee), 8);
	} else {
		const diff = round(gross - pnl, 8);
		fee = diff > 0 ? diff : 0;
		funding = diff > 0 ? 0 : -diff;
	}
	const at = new Date(time).toISOString();
	const lev = num$1(item.leverage) ?? 1;
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
const DAY = 864e5;
const WINDOW = 7 * DAY;
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
	for (let s = from; s < to; s += WINDOW) windows.push([s, Math.min(s + WINDOW - 1, to)]);
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
const EPS = 1e-9;
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
				if (st.pos > EPS && f.qty <= st.pos * (1 + 1e-6)) {
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
		if (p.open <= EPS * p.entryQty) {
			emit(p);
			open.delete(k);
			const rest = f.qty - close;
			if (rest > EPS * f.qty) {
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
* Документация v2 описывает поля по-разному (camelCase / snake_case), поэтому читаем оба варианта.
*/
const PM_API = "https://data-api.polymarket.com";
const pick = (o, ...keys) => {
	for (const k of keys) if (o[k] !== void 0 && o[k] !== null && o[k] !== "") return o[k];
};
const num = (o, ...keys) => {
	const v = pick(o, ...keys);
	const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
	return Number.isFinite(n) ? n : null;
};
const str = (o, ...keys) => {
	const v = pick(o, ...keys);
	return typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : null;
};
/** Время закрытия: timestamp (секунды или мс), иначе дата окончания рынка */
function closeTime(p) {
	const ts = num(p, "timestamp", "closedAt", "closed_at", "updatedAt", "updated_at");
	if (ts !== null && ts > 0) return new Date(ts < 0xe8d4a51000 ? ts * 1e3 : ts).toISOString();
	const d = str(p, "endDate", "end_date", "closedAt", "closed_at");
	if (d && !Number.isNaN(Date.parse(d))) return new Date(Date.parse(d)).toISOString();
	return null;
}
/** Одна закрытая позиция → сделка (null — данных не хватает) */
function pmPositionToTrade(p) {
	const cond = str(p, "conditionId", "condition_id", "market");
	const avg = num(p, "avgPrice", "avg_price");
	const shares = num(p, "totalBought", "total_bought", "size");
	const pnl = num(p, "realizedPnl", "realized_pnl", "cashPnl", "cash_pnl");
	const at = closeTime(p);
	if (!cond || avg === null || avg <= 0 || !shares || shares <= 0 || pnl === null || !at) return null;
	const outcome = str(p, "outcome") ?? `#${num(p, "outcomeIndex", "outcome_index") ?? 0}`;
	const title = str(p, "title", "question", "market_title") ?? cond;
	const exit = Math.min(1, Math.max(0, avg + pnl / shares));
	const code = outcome.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) || "O";
	return {
		exchange: "polymarket",
		market_type: "prediction",
		symbol: `PM-${cond.replace(/^0x/i, "").slice(0, 8).toUpperCase()}-${code}`,
		title: `${title} — ${outcome}`.slice(0, 300),
		side: "long",
		entry_at: at,
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

// src/lib/sync/run.ts
/**
* Синхронизация одного подключения — общий движок для браузера и сервера (sync-worker по расписанию).
* Всё внешнее (запросы к бирже, база) передаётся снаружи в deps: в браузере — с правами пользователя,
* на сервере — с правами service_role. Так логика одна и покрыта одними тестами.
*/
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
			const info = await checkBybitKey(deps.bybitCall);
			if (!info.readOnly) throw new SyncError("KEY_NOT_READONLY");
			await deps.setKeyExpiry?.(info.expiresAt);
			const from = conn.cursor_at ? Date.parse(conn.cursor_at) - 2 * DAY : now - 730 * DAY;
			trades = await fetchBybitTrades(deps.bybitCall, from, now);
			nextCursor = now;
		} else if (conn.exchange === "hyperliquid") {
			const from = conn.cursor_at ? Date.parse(conn.cursor_at) : 0;
			const res = hlFillsToTrades(await fetchHlFills(conn.api_key, from, deps.fetchFn));
			trades = res.trades;
			nextCursor = res.cursor;
		} else if (conn.exchange === "polymarket") {
			trades = (await fetchPmClosed(deps.polymarketGet ?? pmDirectGet(deps.fetchFn), conn.api_key)).flatMap((p) => {
				const t = pmPositionToTrade(p);
				return t ? [t] : [];
			});
			nextCursor = now;
		} else throw new SyncError("UNSUPPORTED");
		trades = [...new Map(trades.map((t) => [t.external_id, t])).values()];
		const existing = await deps.existingIds(conn.exchange, trades.map((t) => t.external_id));
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
/**
* Подпись запросов Bybit v5 (HMAC-SHA256) и строка параметров.
* Чистые функции без Deno — их проверяют тесты Vitest (sign.test.ts).
*/
/** Какие параметры можно передать бирже (всё остальное отбрасываем) */
const ALLOWED_PARAMS = /* @__PURE__ */ new Set([
	"category",
	"symbol",
	"startTime",
	"endTime",
	"limit",
	"cursor"
]);
/** Параметры → строка запроса в том же порядке, в котором её подписываем */
function buildQuery(params) {
	return Object.entries(params).filter(([k, v]) => ALLOWED_PARAMS.has(k) && (typeof v === "string" || typeof v === "number") && String(v) !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
}
/** Подпись Bybit: HMAC-SHA256(секрет, timestamp + apiKey + recvWindow + queryString) в hex */
async function bybitSignature(secret, payload) {
	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey("raw", enc.encode(secret), {
		name: "HMAC",
		hash: "SHA-256"
	}, false, ["sign"]);
	const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
	return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

export { SyncError, buildQuery, bybitSignature, runSync, toSyncError };