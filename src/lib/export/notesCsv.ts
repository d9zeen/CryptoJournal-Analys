/**
 * Выгрузка заметок дня (календарь, 0017) отдельным CSV-файлом — рядом с файлом сделок.
 * Тот же формат, что у сделок: разделитель «;», UTF-8 с BOM, текст с защитой от формул (csvCell).
 */
import type { DayNote } from '@/types/db'
import { csvCell } from './tradesCsv'

export const NOTES_COLUMNS = ['day', 'text', 'updated_at'] as const

export function notesToCsv(notes: Pick<DayNote, 'day' | 'text' | 'updated_at'>[]): string {
  const lines = [NOTES_COLUMNS.join(';')]
  for (const n of [...notes].sort((a, b) => a.day.localeCompare(b.day))) lines.push([csvCell(n.day), csvCell(n.text, true), csvCell(n.updated_at)].join(';'))
  return '﻿' + lines.join('\r\n') + '\r\n'
}

/** Имя файла: cryptohex-day-notes-2026-11-14.csv */
export function notesFilename(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `cryptohex-day-notes-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.csv`
}
