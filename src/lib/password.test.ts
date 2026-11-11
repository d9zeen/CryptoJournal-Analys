import { describe, expect, it } from 'vitest'
import { passwordStrength } from './password'

describe('passwordStrength', () => {
  it('пусто — 0', () => expect(passwordStrength('').level).toBe(0))
  it('короче 6 — слабый, первая подсказка — длина', () => {
    const s = passwordStrength('abc')
    expect(s.level).toBe(1)
    expect(s.missing[0]).toBe('length')
  })
  it('простой пароль из 6 букв — слабый, но допустим (подсказка, не запрет)', () => {
    expect(passwordStrength('qwerty')).toEqual({ level: 1, missing: ['long', 'digit', 'case', 'symbol'] })
  })
  it('растёт с длиной, цифрами, регистром и символами', () => {
    expect(passwordStrength('qwerty12').level).toBe(1)
    expect(passwordStrength('qwerty1234').level).toBe(2)
    expect(passwordStrength('Qwerty1234').level).toBe(3)
    expect(passwordStrength('Qwerty1234!').level).toBe(4)
    expect(passwordStrength('Qwerty1234!').missing).toEqual([])
  })
  it('кириллица тоже считается', () => {
    expect(passwordStrength('Пароль-2026').missing).toEqual([])
  })
})
