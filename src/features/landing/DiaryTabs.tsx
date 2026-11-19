/**
 * «Как выглядит дневник изнутри» на главной (вариант А владельца, 19.11.2026; образцы — 21st.dev shadcnblocks feature108, Refero · Linear):
 * капсула вкладок по центру (как вкладки «Разбора») → строка о выбранном экране → одно большое окно со снимком, как превью дашборда на первом экране.
 * Снимки — настоящие экраны демо-счёта (e2e/zz-diary-screens.spec.ts, `npm run shots:diary`): тема и язык — как у сайта, телефон — свои снимки.
 * Вкладки переключаются только по нажатию (сами не листаются); стрелки ← → — по правилам ARIA (lib/radioKeys).
 */
import { useId, useState } from 'react'
import { fmt, useLang, useT } from '@/i18n'
import { useTheme } from '@/lib/theme'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { radioKeys } from '@/lib/radioKeys'

const SCREENS = ['trade', 'list', 'analysis', 'chart'] as const
type Screen = (typeof SCREENS)[number]

const FILES = import.meta.glob('@/assets/landing/diary/*.jpg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const byName = Object.fromEntries(Object.entries(FILES).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -4), url]))

/** Адрес снимка: экран, тема, язык, телефон / компьютер */
export function diaryShot(screen: Screen, theme: 'light' | 'dark', lang: 'ru' | 'en', phone: boolean): string | undefined {
  return byName[`${screen}-${theme}-${lang}-${phone ? 'phone' : 'desk'}`]
}

export function DiaryTabs() {
  const t = useT()
  const d = t.landing.inside
  const lang = useLang()
  const theme = useTheme()
  const phone = useMediaQuery('(max-width: 639px)')
  const [cur, setCur] = useState<Screen>('trade')
  const id = useId()
  const src = diaryShot(cur, theme, lang, phone)
  // при первом наведении на вкладки — подгрузить остальные снимки, чтобы переключение было мгновенным
  const preload = () => SCREENS.forEach((s) => {
    const url = diaryShot(s, theme, lang, phone)
    if (url) new Image().src = url
  })

  return (
    <div data-diary className="flex flex-col items-center gap-5">
      <div role="tablist" aria-label={d.tabsLabel} onKeyDown={radioKeys} onPointerEnter={preload} onFocus={preload} className="flex max-w-full items-center gap-0.5 overflow-x-auto overflow-y-hidden rounded-full border border-border bg-surface p-1 shadow-sm">
        {SCREENS.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            id={`${id}-${s}`}
            aria-selected={cur === s}
            aria-controls={`${id}-panel`}
            tabIndex={cur === s ? 0 : -1}
            onClick={() => setCur(s)}
            className={`relative shrink-0 rounded-full px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors sm:px-4 ${cur === s ? 'bg-surface-2 text-text' : 'text-muted hover:text-text'}`}
          >
            {cur === s && <span className="absolute -top-1 left-1/2 h-1 w-6 -translate-x-1/2 rounded-full bg-primary" aria-hidden />}
            {d.tabs[s]}
          </button>
        ))}
      </div>
      <p data-diary-line className="min-h-[2lh] max-w-2xl text-center text-base text-balance text-muted sm:min-h-0">
        {d.lines[cur]}
      </p>
      {/* окно — как превью дашборда на первом экране: три точки и снимок; размер окна не меняется при смене вкладки */}
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${cur}`} className="w-full rounded-xl border border-border bg-surface/40 p-2 sm:p-3">
        <div className="flex items-center gap-1.5 px-2 pt-1 pb-2.5" aria-hidden>
          <i className="size-2.5 rounded-full bg-border" />
          <i className="size-2.5 rounded-full bg-border" />
          <i className="size-2.5 rounded-full bg-border" />
        </div>
        <div className="aspect-[390/640] overflow-hidden rounded-lg border border-border bg-bg sm:aspect-[1280/800]">
          {src && (
            <img
              key={src}
              data-diary-shot={cur}
              src={src}
              alt={fmt(d.alt, { name: d.tabs[cur] })}
              loading="lazy"
              decoding="async"
              className="animate-fade-in size-full object-cover object-top"
            />
          )}
        </div>
      </div>
    </div>
  )
}
