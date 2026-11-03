/**
 * Минимальный, но честный парсер CSV:
 * кавычки ("a,b"), удвоенные кавычки внутри (""), переносы строк внутри кавычек,
 * BOM в начале, CRLF / LF, автоопределение разделителя (, ; Tab).
 */
export type CsvTable = { headers: string[]; rows: string[][]; delimiter: string }

const CANDIDATES = [',', ';', '\t'] as const

/** Разделитель — тот, что чаще всего встречается в первой строке вне кавычек. */
export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  let best: string = ','
  let bestCount = 0
  for (const d of CANDIDATES) {
    let count = 0
    let quoted = false
    for (const ch of firstLine) {
      if (ch === '"') quoted = !quoted
      else if (!quoted && ch === d) count++
    }
    if (count > bestCount) {
      best = d
      bestCount = count
    }
  }
  return best
}

export function parseCsv(input: string): CsvTable {
  const text = input.replace(/^﻿/, '')
  const delimiter = detectDelimiter(text)
  const records: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
      continue
    }
    if (ch === '"' && field === '') quoted = true
    else if (ch === delimiter) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      records.push(row)
      row = []
      field = ''
    } else field += ch
  }
  if (field !== '' || row.length) {
    row.push(field)
    records.push(row)
  }

  // пустые строки (в т.ч. в конце файла) пропускаем
  const nonEmpty = records.filter((r) => r.some((c) => c.trim() !== ''))
  const [headerRow = [], ...rows] = nonEmpty
  return { headers: headerRow.map((h) => h.trim()), rows: rows.map((r) => r.map((c) => c.trim())), delimiter }
}
