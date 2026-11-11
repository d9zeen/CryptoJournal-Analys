/**
 * Палитра прибыли / убытка — компактная полоска в «Настройки → Оформление» (ревью 11.11.2026; раньше была под календарём).
 * На палитру — плашка W / L в её цветах (без подписей — выбор владельца; название только во всплывающей подсказке). Три палитры — всем; остальные на Basic под замком (ссылка на тарифы).
 */
import { useState } from 'react'
import { Link } from 'react-router'
import { useT } from '@/i18n'
import { useProfile, useUpdateProfile, useUsage } from '@/features/settings/api'
import { applyPalette, canUsePalette, isPalette, PALETTES, type Palette } from '@/lib/palette'
import { dbErrorMessage } from '@/lib/errors'

export function PaletteStrip() {
  const t = useT()
  const a = t.settings.appearance
  const { data: profile } = useProfile()
  const { data: usage } = useUsage()
  const update = useUpdateProfile()
  const [error, setError] = useState<string | null>(null)
  const plan = usage?.plan
  const current: Palette = isPalette(profile?.palette) && canUsePalette(profile.palette, plan) ? profile.palette : 'classic'
  const anyLocked = PALETTES.some((p) => !canUsePalette(p, plan))

  async function choose(p: Palette) {
    if (!canUsePalette(p, plan) || p === current) return
    setError(null)
    applyPalette(p) // сразу видно на странице
    try {
      await update.mutateAsync({ palette: p })
    } catch (e) {
      applyPalette(current)
      setError(dbErrorMessage(e, t))
    }
  }

  if (!usage) return null
  return (
    <div data-shot="palette" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
      <div className="flex flex-col gap-1">
        <span className="text-muted">{a.palette}</span>
        {anyLocked && (
          <Link to="/plans" className="flex items-center gap-1 font-semibold text-primary hover:underline">
            {a.paletteLocked}
          </Link>
        )}
      </div>
      <div role="radiogroup" aria-label={a.palette} className="flex flex-wrap gap-1.5">
        {PALETTES.map((p) => {
          const active = p === current
          const locked = !canUsePalette(p, plan)
          return (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={a.palettes[p]}
              title={locked ? `${a.palettes[p]} · ${a.paletteLocked}` : a.palettes[p]}
              disabled={locked}
              onClick={() => void choose(p)}
              data-palette={p}
              className={`relative flex items-center rounded-md border px-1.5 py-1.5 transition-colors disabled:cursor-not-allowed ${
                active ? 'border-primary bg-primary/10' : 'border-border bg-surface-2/40 hover:border-muted'
              }`}
            >
              {locked && (
                <svg viewBox="0 0 24 24" className="absolute top-1 right-1 size-3 text-muted" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
                  <rect x="5" y="11" width="14" height="9" rx="2" />
                  <path d="M8.5 11V8a3.5 3.5 0 017 0v3" strokeLinecap="round" />
                </svg>
              )}
              <span className={`flex gap-1 ${locked ? 'opacity-45' : ''}`}>
                <span className="num flex size-6 items-center justify-center rounded bg-profit/15 text-xs font-bold text-profit">W</span>
                <span className="num flex size-6 items-center justify-center rounded bg-loss/15 text-xs font-bold text-loss">L</span>
              </span>
            </button>
          )
        })}
      </div>
      {error && <span className="text-loss">{error}</span>}
    </div>
  )
}
