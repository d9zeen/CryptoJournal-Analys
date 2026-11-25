import { describe, expect, it } from 'vitest'
import { notesFilename, notesToCsv } from './notesCsv'

describe('notesToCsv', () => {
  it('заголовок, дни по порядку, текст с переносами и кавычками — в кавычках, формулы экранируются', () => {
    const csv = notesToCsv([
      { day: '2026-11-12', text: 'итог: "два стопа"\nзавтра — без FOMO', updated_at: '2026-11-12T20:00:00Z' },
      { day: '2026-11-10', text: '=HYPERLINK("x")', updated_at: '2026-11-10T08:00:00Z' },
    ])
    expect(csv.startsWith('﻿day;text;updated_at\r\n')).toBe(true)
    const rows = csv.slice(1).split('\r\n')
    expect(rows[1]).toBe(`2026-11-10;"'=HYPERLINK(""x"")";2026-11-10T08:00:00Z`)
    expect(rows[2]).toBe('2026-11-12;"итог: ""два стопа""\nзавтра — без FOMO";2026-11-12T20:00:00Z')
  })
  it('пусто — только заголовок; имя файла с датой', () => {
    expect(notesToCsv([])).toBe('﻿day;text;updated_at\r\n')
    expect(notesFilename(new Date(2026, 10, 4))).toBe('cryptohex-day-notes-2026-11-04.csv')
  })
})
