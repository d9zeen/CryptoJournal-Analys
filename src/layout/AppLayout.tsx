import { NavLink, Outlet, useMatch } from 'react-router'
import { useAuth } from '@/features/auth/AuthProvider'
import { fmt, useT } from '@/i18n'
import { Logo, LogoMark } from '@/components/Logo'
import { PlanMenu } from '@/features/plans/PlanMenu'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LangSwitch } from '@/components/LangSwitch'
import { useIsAdmin } from '@/features/admin/api'
import { useAutoSync } from '@/features/connections/api'
import { useProfile, useUsage } from '@/features/settings/api'
import { applyPalette, canUsePalette, isPalette } from '@/lib/palette'
import { useEffect } from 'react'

const SETTINGS_ICON =
  'M12 15a3 3 0 100-6 3 3 0 000 6zm7.4-3a7.4 7.4 0 00-.1-1.3l2-1.6-2-3.4-2.4 1a7.6 7.6 0 00-2.2-1.3L14.3 2h-4l-.4 2.4a7.6 7.6 0 00-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 000 2.6l-2 1.6 2 3.4 2.4-1c.7.5 1.4 1 2.2 1.3l.4 2.4h4l.4-2.4c.8-.3 1.5-.8 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3z'
const PHONE_NAV = ['/dashboard', '/calendar', '/trades', '/analysis', '/import']
const headerBtn = 'rounded-lg p-2 text-muted transition-colors hover:bg-surface-2 hover:text-text'

function useNavItems() {
  const t = useT()
  const { data: isAdmin } = useIsAdmin()
  const items = [
    { to: '/dashboard', label: t.nav.dashboard, icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z' },
    { to: '/calendar', label: t.nav.calendar, icon: 'M4 6.5A1.5 1.5 0 015.5 5h13A1.5 1.5 0 0120 6.5v12a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 18.5v-12zM4 10h16M8 3v4m8-4v4M8 14h2m4 0h2m-8 3h2' },
    { to: '/trades', label: t.nav.trades, icon: 'M4 6h16M4 12h16M4 18h10' },
    { to: '/analysis', label: t.nav.analysis, icon: 'M4 20V11m6 9V5m6 15v-6m5 6H3' },
    { to: '/import', label: t.nav.import, icon: 'M12 3v12m0 0l-4-4m4 4l4-4M4 17v3h16v-3' },
    { to: '/settings', label: t.nav.settings, icon: SETTINGS_ICON },
  ]
  // «Админка» — только у админа (доступ всё равно проверяет база)
  if (isAdmin) items.push({ to: '/admin', label: t.nav.admin, icon: 'M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3zm-3 9l2 2 4-4' })
  return items
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  )
}

export function AppLayout() {
  const t = useT()
  const items = useNavItems()
  // нижнее меню телефона — 5 пунктов; настройки — шестерёнкой в шапке, админка — из настроек
  const phoneItems = items.filter((i) => PHONE_NAV.includes(i.to))
  useAutoSync() // подключённые биржи подтягивают сделки сами
  usePaletteSync()
  // форма сделки (/trades/new, /trades/:id): нижнего меню и «+» в шапке нет — меню вместе с кнопками формы закрывало поля, «+» ведёт туда же, где человек уже есть
  const phoneNav = useMatch('/trades/:id') === null

  return (
    <div className={`min-h-dvh md:pb-0 ${phoneNav ? 'pb-20' : ''}`}>
      {/* Верхняя полоса меню — планшет и компьютер (как у Scout; образец 21st.dev header-2). Левой панели больше нет */}
      <TopNav items={items} />

      {/* Шапка телефона: логотип, «+» (новая сделка), язык EN | RU, тема (от 640px; уже — в настройках), настройки (выход — в «Настройки → Данные») */}
      <header className="sticky top-0 z-10 border-b border-border bg-bg/90 backdrop-blur md:hidden">
        <div className="flex h-14 items-center gap-3 px-4 sm:gap-6">
          <Logo />
          <div className="ml-auto flex items-center gap-1 sm:gap-3">
            {/* «+ новая сделка» — кроме самой формы сделки (/trades/new, /trades/:id): человек уже на ней */}
            {phoneNav && (
              <NavLink to="/trades/new" aria-label={t.tradeForm.titleNew} title={t.tradeForm.titleNew} className={headerBtn}>
                <Icon d="M12 5v14M5 12h14" />
              </NavLink>
            )}
            <LangSwitch />
            {/* на узком телефоне тема — в «Настройки → Оформление» (в шапке не хватает места) */}
            <span className="hidden sm:contents">
              <ThemeToggle />
            </span>
            <NavLink to="/settings" aria-label={t.nav.settings} title={t.nav.settings} className={headerBtn}>
              <Icon d={SETTINGS_ICON} />
            </NavLink>
          </div>
        </div>
      </header>

      {/* контент — по той же ширине, что и верхняя полоса (до 2200 px) */}
      <main className="mx-auto max-w-[2200px] px-4 py-6 lg:px-8 lg:py-8">
        <Outlet />
      </main>

      {/* Нижнее меню на телефоне: там нет наведения, поэтому подписи остаются. На форме сделки его нет */}
      <nav
        hidden={!phoneNav}
        className="fixed inset-x-0 bottom-0 z-10 grid border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
        style={{ gridTemplateColumns: `repeat(${phoneItems.length}, minmax(0, 1fr))` }}
      >
        {phoneItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            viewTransition
            className={({ isActive }) => `flex min-w-0 flex-col items-center gap-1 py-2 text-xs transition-colors ${isActive ? 'text-primary' : 'text-muted'}`}
          >
            <Icon d={item.icon} />
            <span className="max-w-full truncate px-0.5">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

type NavItem = ReturnType<typeof useNavItems>[number]

/**
 * Верхняя полоса (от 768px), образец — 21st.dev tubelight-navbar («капсула», выбор владельца 15.11.2026):
 * слева логотип и тариф, строго по центру — капсула с пунктами меню (сетка 1fr / auto / 1fr — центр на любой ширине),
 * справа лимит (Basic, от 1536px), язык, тема, почта (от 1024px) и выход.
 * Над активным пунктом — чёрточка цвета кнопок. До 1280px в капсуле только значки (подпись — при наведении), с 1280px — значок не нужен, только подписи.
 */
function TopNav({ items }: { items: NavItem[] }) {
  const t = useT()
  const { user, signOut } = useAuth()
  return (
    <header data-shot="topnav" className="sticky top-0 z-20 hidden border-b border-border bg-bg/85 backdrop-blur md:block">
      <div className="mx-auto grid h-16 max-w-[2200px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-4 lg:gap-5 lg:px-8">
        <div className="flex min-w-0 items-center gap-2">
          <NavLink to="/dashboard" viewTransition aria-label={t.app.name} className="flex shrink-0 items-center rounded-xl p-1">
            <span className="xl:hidden">
              <LogoMark className="size-8" />
            </span>
            <span className="hidden xl:inline">
              <Logo />
            </span>
          </NavLink>
          <PlanMenu />
        </div>

        <nav aria-label={t.nav.main} data-shot="nav-capsule" className="flex items-center gap-0.5 rounded-full border border-border bg-surface p-1 shadow-sm">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              viewTransition
              aria-label={item.label}
              className={({ isActive }) =>
                `group relative flex shrink-0 items-center rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors xl:px-3.5 ${
                  isActive ? 'bg-surface-2 text-text' : 'text-muted hover:text-text'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {/* «лампа» над активным пунктом, как в образце */}
                  {isActive && <span className="absolute -top-1 left-1/2 h-1 w-6 -translate-x-1/2 rounded-full bg-primary" aria-hidden />}
                  <span className="xl:hidden">
                    <Icon d={item.icon} />
                  </span>
                  <span className="hidden xl:inline">{item.label}</span>
                  {/* подпись при наведении — пока в капсуле одни значки (до 1280px) */}
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute top-full left-1/2 mt-2 -translate-x-1/2 -translate-y-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium whitespace-nowrap text-text opacity-0 shadow-lg transition-[opacity,translate] duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100 xl:hidden"
                  >
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="flex min-w-0 items-center justify-end gap-2">
          <UsageLine />
          <LangSwitch />
          <ThemeToggle />
          <span
            className="hidden size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-text uppercase lg:flex"
            title={user?.email ?? ''}
            aria-hidden
          >
            {(user?.email ?? '?').slice(0, 1)}
          </span>
          <button type="button" onClick={signOut} aria-label={t.nav.logout} title={t.nav.logout} className={headerBtn}>
            <Icon d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 16l-4-4 4-4M6 12h10" />
          </button>
        </div>
      </div>
    </header>
  )
}

/** Лимит сделок в верхней полосе — только на Basic и от 2xl (1536px): «43 / 50» и тонкая полоска (у 90 % — красная); ведёт на тарифы */
function UsageLine() {
  const t = useT()
  const { data: usage } = useUsage()
  if (!usage?.trade_limit) return null
  const limit = usage.trade_limit
  const share = Math.min(1, usage.trades_created / limit)
  return (
    <NavLink
      to="/plans"
      viewTransition
      title={fmt(t.settings.usageFree, { used: usage.trades_created, limit })}
      className="mr-1 hidden w-24 shrink-0 rounded-lg px-1 py-1 transition-colors hover:bg-surface-2/60 2xl:block"
    >
      <div className="num text-xs text-muted">{fmt(t.nav.usageShort, { used: usage.trades_created, limit })}</div>
      <div className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-surface-2">
        <i className={`block h-full rounded-full ${share >= 0.9 ? 'bg-loss' : 'bg-primary'}`} style={{ width: `${share * 100}%` }} />
      </div>
    </NavLink>
  )
}

/** Палитра прибыли / убытка из профиля; платная на Basic (Pro закончился) — классическая */
function usePaletteSync() {
  const { data: profile } = useProfile()
  const { data: usage } = useUsage()
  useEffect(() => {
    if (!profile || !usage) return
    applyPalette(isPalette(profile.palette) && canUsePalette(profile.palette, usage.plan) ? profile.palette : 'classic')
  }, [profile, usage])
}
