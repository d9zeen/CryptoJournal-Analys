import { NavLink, Outlet } from 'react-router'
import { useAuth } from '@/features/auth/AuthProvider'
import { useT } from '@/i18n'
import { Logo, LogoMark } from '@/components/Logo'
import { setTheme, useTheme } from '@/lib/theme'
import { useIsAdmin } from '@/features/admin/api'
import { useAutoSync } from '@/features/connections/api'
import { useUsage } from '@/features/settings/api'

function useNavItems() {
  const t = useT()
  const { data: isAdmin } = useIsAdmin()
  const items = [
    { to: '/dashboard', label: t.nav.dashboard, icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z' },
    { to: '/trades', label: t.nav.trades, icon: 'M4 6h16M4 12h16M4 18h10' },
    { to: '/analysis', label: t.nav.analysis, icon: 'M4 20V11m6 9V5m6 15v-6m5 6H3' },
    { to: '/import', label: t.nav.import, icon: 'M12 3v12m0 0l-4-4m4 4l4-4M4 17v3h16v-3' },
    { to: '/settings', label: t.nav.settings, icon: 'M12 15a3 3 0 100-6 3 3 0 000 6zm7.4-3a7.4 7.4 0 00-.1-1.3l2-1.6-2-3.4-2.4 1a7.6 7.6 0 00-2.2-1.3L14.3 2h-4l-.4 2.4a7.6 7.6 0 00-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 000 2.6l-2 1.6 2 3.4 2.4-1c.7.5 1.4 1 2.2 1.3l.4 2.4h4l.4-2.4c.8-.3 1.5-.8 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3z' },
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
  useAutoSync() // подключённые биржи подтягивают сделки сами

  return (
    <div className="min-h-dvh pb-20 md:pb-0 md:pl-[72px]">
      {/* Левая панель (компьютер): только иконки, подпись — при наведении */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[72px] flex-col items-center gap-1 border-r border-border bg-surface py-3 md:flex">
        <NavLink to="/dashboard" viewTransition aria-label={t.app.name} className="mb-3 rounded-xl p-1.5">
          <LogoMark className="size-8" />
        </NavLink>
        <nav className="flex flex-col items-center gap-1.5">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              viewTransition
              aria-label={item.label}
              className={({ isActive }) =>
                `group relative flex size-11 items-center justify-center rounded-xl transition-colors ${
                  isActive ? 'bg-surface-2 text-text shadow-glow' : 'text-muted hover:bg-surface-2/60 hover:text-text'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {/* полоска у активного пункта */}
                  {isActive && <span className="absolute top-1/2 -left-[14px] h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" aria-hidden />}
                  <Icon d={item.icon} />
                  {/* подпись при наведении и при фокусе с клавиатуры */}
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute top-1/2 left-full ml-3 -translate-x-1 -translate-y-1/2 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium whitespace-nowrap text-text opacity-0 shadow-lg transition-[opacity,translate] duration-150 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
                  >
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Верхняя панель */}
      <header className="sticky top-0 z-10 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1800px] items-center gap-6 px-4 lg:px-8">
          <span className="md:hidden">
            <Logo />
          </span>
          <span className="hidden font-display text-[15px] font-semibold tracking-tight md:inline">{t.app.name}</span>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <PlanBadge />
            <ThemeToggle />
            <span className="hidden max-w-48 truncate text-sm text-muted sm:inline">{user?.email}</span>
            <button onClick={signOut} className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-text">
              {t.nav.logout}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1800px] px-4 py-6 lg:px-8">
        <Outlet />
      </main>

      {/* Нижнее меню на телефоне: там нет наведения, поэтому подписи остаются */}
      <nav className={`fixed inset-x-0 bottom-0 z-10 grid ${items.length > 5 ? 'grid-cols-6' : 'grid-cols-5'} border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden`}>
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            viewTransition
            className={({ isActive }) => `flex flex-col items-center gap-1 py-2 text-[11px] transition-colors ${isActive ? 'text-primary' : 'text-muted'}`}
          >
            <Icon d={item.icon} />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
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

function ThemeToggle() {
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
      className="rounded-lg p-2 text-muted transition-colors hover:bg-surface-2 hover:text-text"
    >
      {next === 'light' ? (
        // солнце
        <Icon d="M12 4V2m0 20v-2m8-8h2M2 12h2m13.66-5.66l1.41-1.41M4.93 19.07l1.41-1.41m0-11.32L4.93 4.93m14.14 14.14l-1.41-1.41M12 17a5 5 0 100-10 5 5 0 000 10z" />
      ) : (
        // луна
        <Icon d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
      )}
    </button>
  )
}
