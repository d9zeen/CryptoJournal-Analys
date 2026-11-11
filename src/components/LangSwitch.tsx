/**
 * Переключатель языка «EN | RU»: два положения, одно нажатие — и язык сменился.
 * Подложка выбранного языка переезжает (только transform; без анимаций — сразу).
 * Полные названия (English / Русский) — во всплывающей подсказке; для экранных дикторов — группа «Язык / Language».
 */
import { setLang, useLang, useT } from '@/i18n'
import { LANGS } from '@/lib/locale'

export function LangSwitch({ className = '' }: { className?: string }) {
  const t = useT()
  const lang = useLang()
  const index = LANGS.indexOf(lang)
  return (
    <div
      role="radiogroup"
      aria-label={t.lang.label}
      className={`relative inline-grid shrink-0 grid-cols-2 rounded-lg border border-border bg-surface-2 p-0.5 text-xs font-semibold ${className}`}
    >
      {/* подложка выбранного: ширина — половина, сдвиг — на свою половину */}
      <span
        aria-hidden
        className="absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-md bg-surface transition-transform duration-300 ease-out"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={l === lang}
          lang={l}
          title={t.lang.names[l]}
          onClick={() => setLang(l)}
          className={`relative z-10 h-7 min-w-8 rounded-md px-1.5 uppercase transition-colors focus-visible:outline-2 focus-visible:outline-primary ${l === lang ? 'text-text' : 'text-muted hover:text-text'}`}
        >
          {l}
        </button>
      ))}
    </div>
  )
}
