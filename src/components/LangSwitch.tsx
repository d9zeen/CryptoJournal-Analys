/**
 * Переключатель языка: кнопка «глобус + EN / RU», по нажатию — меню «English / Русский».
 * Названия языков — каждое на своём языке. Закрывается кликом мимо и клавишей Esc.
 * up — меню открывается вверх (низ левой панели); compact — без глобуса, только «EN» (там мало места).
 */
import { useEffect, useId, useRef, useState } from 'react'
import { setLang, useLang, useT } from '@/i18n'
import { LANGS } from '@/lib/locale'

const GLOBE = 'M12 21a9 9 0 100-18 9 9 0 000 18zM3.6 9h16.8M3.6 15h16.8M12 3a14 14 0 010 18M12 3a14 14 0 000 18'

export function LangSwitch({ up = false, compact = false, className = '' }: { up?: boolean; compact?: boolean; className?: string }) {
  const t = useT()
  const lang = useLang()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={box} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`${t.lang.label}: ${t.lang.names[lang]}`}
        title={t.lang.label}
        className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-muted uppercase transition-colors hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:outline-primary"
      >
        {!compact && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="size-[18px]" aria-hidden>
            <path d={GLOBE} />
          </svg>
        )}
        {lang}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className={`absolute right-0 z-40 min-w-36 rounded-lg border border-border bg-surface p-1 ${up ? 'bottom-full mb-1' : 'top-full mt-1'}`}
        >
          {LANGS.map((l) => (
            <button
              key={l}
              type="button"
              role="menuitemradio"
              aria-checked={l === lang}
              lang={l}
              onClick={() => {
                setOpen(false)
                setLang(l)
              }}
              className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-surface-2 ${l === lang ? 'font-semibold text-text' : 'text-muted'}`}
            >
              {t.lang.names[l]}
              {l === lang && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="size-4 text-primary" aria-hidden>
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
