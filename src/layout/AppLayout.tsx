import { NavLink, Outlet } from 'react-router'
import { useAuth } from '@/features/auth/AuthProvider'
import { fmt, useT } from '@/i18n'
import { Logo, LogoMark } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
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
  const { user, signOut } = useAuth()
  const items = useNavItems()
  // нижнее меню телефона — 5 пунктов; настройки — шестерёнкой в шапке, админка — из настроек
  const phoneItems = items.filter((i) => PHONE_NAV.includes(i.to))
  useAutoSync() // подключённые биржи подтягивают сделки сами
  usePaletteSync()

  return (
    <div className="min-h-dvh pb-20 md:pb-0 md:pl-[72px] lg:pl-[232px]">
      {/*
        Левая панель (компьютер). Широкий экран (lg): логотип, пункты с подписями, внизу — тариф и профиль.
        Планшет (md): только иконки, подпись — при наведении.
      */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[72px] flex-col border-r border-border bg-surface py-3 md:flex lg:w-[232px] lg:px-3">
        <NavLink to="/dashboard" viewTransition aria-label={t.app.name} className="mb-4 flex items-center justify-center rounded-xl p-1.5 lg:justify-start lg:px-2">
          <span className="lg:hidden">
            <LogoMark className="size-8" />
          </span>
          <span className="hidden lg:inline">
            <Logo />
          </span>
        </NavLink>
        <nav className="flex flex-col items-center gap-1 lg:items-stretch">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              viewTransition
              aria-label={item.label}
              className={({ isActive }) =>
                `group relative flex size-11 items-center justify-center gap-3 rounded-lg text-sm font-medium transition-colors lg:h-10 lg:w-auto lg:justify-start lg:px-3 ${
                  isActive ? 'bg-surface-2 text-text' : 'text-muted hover:bg-surface-2/60 hover:text-text'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {/* полоска у активного пункта */}
                  {isActive && <span className="absolute top-1/2 -left-[14px] h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary lg:-left-3" aria-hidden />}
                  <Icon d={item.icon} />
                  <span className="hidden lg:inline">{item.label}</span>
                  {/* подпись при наведении (только узкая панель) */}
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute top-1/2 left-full ml-3 -translate-x-1 -translate-y-1/2 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium whitespace-nowrap text-text opacity-0 shadow-lg transition-[opacity,translate] duration-150 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 lg:hidden"
                  >
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
        {/* низ панели на широком экране: тариф с лимитом, тема, профиль */}
        <div className="mt-auto hidden flex-col gap-3 lg:flex">
          <PlanCard />
          <div className="flex items-center gap-2 border-t border-border pt-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-text uppercase" aria-hidden>
              {(user?.email ?? '?').slice(0, 1)}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-muted" title={user?.email ?? ''}>
              {user?.email}
            </span>
            <ThemeToggle />
            <button type="button" onClick={signOut} aria-label={t.nav.logout} title={t.nav.logout} className="rounded-lg p-2 text-muted transition-colors hover:bg-surface-2 hover:text-text">
              <Icon d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 16l-4-4 4-4M6 12h10" />
            </button>
          </div>
        </div>
      </aside>

      {/* Верхняя панель — телефон и планшет; на широком экране всё это в левой панели.
          Телефон: логотип, «+» (новая сделка), тема, настройки (выход — внизу настроек). Планшет: тариф, тема, почта, выход. */}
      <header className="sticky top-0 z-10 border-b border-border bg-bg/90 backdrop-blur lg:hidden">
        <div className="mx-auto flex h-14 max-w-[1800px] items-center gap-6 px-4">
          <span className="md:hidden">
            <Logo />
          </span>
          <div className="ml-auto flex items-center gap-1 sm:gap-3 md:gap-2">
            <NavLink to="/trades/new" aria-label={t.tradeForm.titleNew} title={t.tradeForm.titleNew} className={`${headerBtn} md:hidden`}>
              <Icon d="M12 5v14M5 12h14" />
            </NavLink>
            <span className="hidden md:contents">
              <PlanBadge />
            </span>
            <ThemeToggle />
            <NavLink to="/settings" aria-label={t.nav.settings} title={t.nav.settings} className={`${headerBtn} md:hidden`}>
              <Icon d={SETTINGS_ICON} />
            </NavLink>
            <span className="hidden max-w-48 truncate text-sm text-muted md:inline">{user?.email}</span>
            <button onClick={signOut} className="hidden rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-text md:inline-flex">
              {t.nav.logout}
            </button>
          </div>
        </div>
      </header>

      {/* на широком экране контент прилегает к левой панели (без пустой полосы слева); шире 2200 px — не растягиваем */}
      <main className="max-w-[2200px] px-4 py-6 lg:px-8 lg:py-8">
        <Outlet />
      </main>

      {/* Нижнее меню на телефоне: там нет наведения, поэтому подписи остаются */}
      <nav
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

/** Карточка тарифа внизу левой панели: название, сколько сделок за месяц из лимита, ссылка на тарифы */
function PlanCard() {
  const t = useT()
  const { data: usage } = useUsage()
  if (!usage) return null
  const limit = usage.trade_limit
  const share = limit ? Math.min(1, usage.trades_created / limit) : 0
  return (
    <NavLink to="/plans" className="block rounded-lg border border-border bg-bg/40 p-3 transition-colors hover:border-muted/50">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-text">{t.plans.names[usage.plan]}</span>
        <span className="text-primary">{t.plans.title}</span>
      </div>
      <div className="mt-2 text-xs text-muted">
        {limit ? fmt(t.settings.usageFree, { used: usage.trades_created, limit }) : fmt(t.settings.usagePro, { used: usage.trades_created })}
      </div>
      {limit && (
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-2">
          <i className={`block h-full rounded-full ${share >= 0.9 ? 'bg-loss' : 'bg-primary'}`} style={{ width: `${share * 100}%` }} />
        </div>
      )}
    </NavLink>
  )
}

/** Тариф в шапке — ссылка на страницу тарифов */
function PlanBadge() {
  const t = useT()
  const { data: usage } = useUsage()
  if (!usage) return null
  const paid = usage.plan !== 'free'
  return (
    <NavLink
      to="/plans"
      className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${paid ? 'bg-primary/15 text-primary hover:bg-primary/25' : 'bg-surface-2 text-muted hover:text-text'}`}
    >
      {t.plans.names[usage.plan]}
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
