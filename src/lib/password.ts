/**
 * Надёжность пароля для подсказки (№5). Только подсказывает и НИЧЕГО не запрещает:
 * правило сайта — минимум 6 символов, простые пароли разрешены (решение владельца 06.11.2026).
 */
export type PasswordTip = 'length' | 'long' | 'digit' | 'case' | 'symbol'

export type PasswordStrength = {
  /** 0 — пусто, 1 — слабый … 4 — надёжный */
  level: 0 | 1 | 2 | 3 | 4
  /** чего не хватает, по важности */
  missing: PasswordTip[]
}

export function passwordStrength(pw: string): PasswordStrength {
  if (!pw) return { level: 0, missing: [] }
  const missing: PasswordTip[] = []
  if (pw.length < 6) missing.push('length')
  else if (pw.length < 10) missing.push('long')
  if (!/\d/.test(pw)) missing.push('digit')
  if (!(/\p{Ll}/u.test(pw) && /\p{Lu}/u.test(pw))) missing.push('case')
  if (!/[^\p{L}\d]/u.test(pw)) missing.push('symbol')
  if (pw.length < 6) return { level: 1, missing }
  // очки: длина 10+, цифра, заглавные и строчные, символ; 6–9 символов без остального — «слабый»
  const points = 4 - missing.length
  const level = Math.max(1, Math.min(4, points)) as 1 | 2 | 3 | 4
  return { level, missing }
}
