/**
 * Палитра прибыли / убытка — компактная полоска под календарём (выбор владельца 07.11.2026: не отдельная карточка в настройках).
 * Кружок на палитру: левая половина — цвет прибыли, правая — убытка. Выбирать — Pro и Pro Plus; на Basic кружки неактивны и ссылка на тарифы.
 */
import { useState } from 'react'
import { Link } from 'react-router'
import { useT } from '@/i18n'
import { useProfile, useUpdateProfile, useUsage } from '@/features/settings/api'
import { applyPalette, canChoosePalette, isPalette, PALETTES, type Palette } from '@/lib/palette'
import { dbErrorMessage } from '@/lib/errors'

export function PaletteStrip() {
  const t = useT()
  const a = t.settings.appearance
  const { data: profile } = useProfile()
  const { data: usage } = useUsage()
  const update = useUpdateProfile()
  const [error, setError] = useState<string | null>(null)
  const allowed = canChoosePalette(usage?.plan)
  const current: Palette = allowed && isPalette(profile?.palette) ? profile.palette : 'classic'

  async function choose(p: Palette) {
    if (!allowed || p === current) return
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
    <div data-shot="palette" className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
      <span className="text-muted">{a.palette}</span>
      <div role="radiogroup" aria-label={a.palette} className="flex flex-wrap gap-1.5">
        {PALETTES.map((p) => {
          const active = p === current
          return (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={a.palettes[p]}
              title={a.palettes[p]}
              disabled={!allowed && p !== 'classic'}
              onClick={() => void choose(p)}
              data-palette={p}
              className={`flex size-6 overflow-hidden rounded-full border-2 transition-[border-color,opacity] disabled:cursor-not-allowed disabled:opacity-35 ${
                active ? 'border-text' : 'border-transparent hover:border-muted'
              }`}
            >
              <i className="block h-full w-1/2 bg-profit" />
              <i className="block h-full w-1/2 bg-loss" />
            </button>
          )
        })}
      </div>
      {!allowed && (
        <Link to="/plans" className="rounded-md bg-surface-2 px-2 py-0.5 font-semibold text-muted hover:text-text">
          {a.paletteLocked}
        </Link>
      )}
      {error && <span className="text-loss">{error}</span>}
    </div>
  )
}
