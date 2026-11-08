/**
 * Кнопка смены темы: солнце (перейти на светлую) / луна (перейти на тёмную).
 * Обе иконки лежат друг на друге и плавно сменяются (поворот + прозрачность); без анимаций — просто меняются.
 */
import { useT } from '@/i18n'
import { setTheme, useTheme } from '@/lib/theme'

const SUN = 'M12 4V2m0 20v-2m8-8h2M2 12h2m13.66-5.66l1.41-1.41M4.93 19.07l1.41-1.41m0-11.32L4.93 4.93m14.14 14.14l-1.41-1.41M12 17a5 5 0 100-10 5 5 0 000 10z'
const MOON = 'M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z'

function Glyph({ d, on }: { d: string; on: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`absolute inset-0 m-auto size-[18px] transition-[opacity,rotate,scale] duration-300 ease-out ${on ? 'scale-100 rotate-0 opacity-100' : 'scale-75 -rotate-90 opacity-0'}`}
    >
      <path d={d} />
    </svg>
  )
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const t = useT()
  const theme = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'
  const label = next === 'light' ? t.nav.toLight : t.nav.toDark
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={label}
      title={label}
      className={`relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:outline-primary ${className}`}
    >
      <Glyph d={SUN} on={next === 'light'} />
      <Glyph d={MOON} on={next === 'dark'} />
    </button>
  )
}
