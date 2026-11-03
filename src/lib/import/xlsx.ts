/**
 * Чтение первого листа Excel (.xlsx) в ту же таблицу, что и CSV.
 * .xlsx — это zip-архив с XML внутри: распаковываем (fflate) и читаем XML простыми регулярками,
 * без тяжёлых библиотек. Даты Excel хранит числами — переводим в «ГГГГ-ММ-ДД чч:мм:сс»
 * (как написано в ячейке; часовой пояс применяется потом, как и для CSV).
 */
import { unzipSync, strFromU8 } from 'fflate'
import type { CsvTable } from './csv'

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e] ?? m),
  )
}

/** Весь текст из <t>…</t> внутри куска XML (строка может состоять из нескольких «прогонов») */
function texts(xml: string): string {
  let out = ''
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += decode(m[1])
  return out
}

function attr(tag: string, name: string): string | null {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null
}

/** A1 → 0, B → 1, AA → 26 */
function colIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A'
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/** Номера стилей ячеек, которые означают дату/время */
function dateStyles(stylesXml: string | undefined): Set<number> {
  const out = new Set<number>()
  if (!stylesXml) return out
  const custom = new Map<number, string>()
  for (const m of stylesXml.matchAll(/<numFmt\s[^>]*>/g)) {
    const id = Number(attr(m[0], 'numFmtId'))
    custom.set(id, decode(attr(m[0], 'formatCode') ?? ''))
  }
  const isDateFmt = (id: number) => {
    if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47)) return true
    const code = custom.get(id)
    if (!code) return false
    const plain = code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '')
    return /[dmyhs]/i.test(plain)
  }
  const cellXfs = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml)?.[1] ?? ''
  let i = 0
  for (const m of cellXfs.matchAll(/<xf\s[^>]*?\/?>/g)) {
    if (isDateFmt(Number(attr(m[0], 'numFmtId') ?? 0))) out.add(i)
    i++
  }
  return out
}

/** Дата Excel (дни с 1899-12-30) → «2026-11-03 14:05:06» */
export function excelDate(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400 * 1000)
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ')
}

function firstSheetPath(files: Record<string, Uint8Array>): string {
  const wb = files['xl/workbook.xml'] ? strFromU8(files['xl/workbook.xml']) : ''
  const rels = files['xl/_rels/workbook.xml.rels'] ? strFromU8(files['xl/_rels/workbook.xml.rels']) : ''
  const sheetTag = /<sheet\s[^>]*>/.exec(wb)?.[0]
  const rid = sheetTag ? (attr(sheetTag, 'r:id') ?? attr(sheetTag, 'id')) : null
  if (rid) {
    for (const m of rels.matchAll(/<Relationship\s[^>]*>/g)) {
      if (attr(m[0], 'Id') === rid) {
        const target = attr(m[0], 'Target') ?? ''
        return target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`
      }
    }
  }
  return 'xl/worksheets/sheet1.xml'
}

export function readXlsx(data: Uint8Array): CsvTable {
  const files = unzipSync(data)
  const sheetXml = files[firstSheetPath(files)]
  if (!sheetXml) throw new Error('XLSX_NO_SHEET')

  const sharedXml = files['xl/sharedStrings.xml'] ? strFromU8(files['xl/sharedStrings.xml']) : ''
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]))
  const dates = dateStyles(files['xl/styles.xml'] ? strFromU8(files['xl/styles.xml']) : undefined)

  const grid: string[][] = []
  for (const rm of strFromU8(sheetXml).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = []
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tag = cm[1]
      const body = cm[2] ?? ''
      const ref = attr(tag, 'r')
      const idx = ref ? colIndex(ref) : row.length
      const type = attr(tag, 't')
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1]
      let value = ''
      if (type === 's') value = shared[Number(v)] ?? ''
      else if (type === 'inlineStr') value = texts(body)
      else if (type === 'str' || type === 'e') value = decode(v ?? '')
      else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE'
      else if (v !== undefined) {
        const num = Number(v)
        value = dates.has(Number(attr(tag, 's') ?? -1)) && Number.isFinite(num) ? excelDate(num) : v
      }
      while (row.length < idx) row.push('')
      row[idx] = value.trim()
    }
    grid.push(row)
  }

  const nonEmpty = grid.filter((r) => r.some((c) => c !== ''))
  // некоторые биржи кладут над таблицей заголовок отчёта — ищем первую «широкую» строку
  const width = Math.max(0, ...nonEmpty.map((r) => r.filter(Boolean).length))
  const headerAt = Math.max(0, nonEmpty.findIndex((r) => r.filter(Boolean).length >= Math.min(width, 3)))
  const [header = [], ...rows] = nonEmpty.slice(headerAt)
  return { headers: header.map((h) => h.trim()), rows, delimiter: 'xlsx' }
}

/** Файл → таблица: .xlsx читаем как Excel, остальное — как текст CSV */
export async function readTableFile(file: File): Promise<CsvTable | string> {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer())
  const isZip = head[0] === 0x50 && head[1] === 0x4b // «PK» — zip
  if (isZip || /\.xlsx$/i.test(file.name)) return readXlsx(new Uint8Array(await file.arrayBuffer()))
  return file.text()
}
