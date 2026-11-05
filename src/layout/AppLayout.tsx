import { NavLink, Outlet } from 'react-router'
import { useAuth } from '@/features/auth/AuthProvider'
import { useT } from '@/i18n'
import { Logo } from '@/components/Logo'
import { setTheme, useTheme } from '@/lib/theme'

function useNavItems() {
  const t = useT()
  return [
    { to: '/dashboard', label: t.nav.dashboard, icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z' },
    { to: '/trades', label: t.nav.trades, icon: 'M4 6h16M4 12h16M4 18h10' },
    { to: '/import', label: t.nav.import, icon: 'M12 3v12m0 0l-4-4m4 4l4-4M4 17v3h16v-3' },
    { to: '/settings', label: t.nav.settings, icon: 'M12 15a3 3 0 100-6 3 3 0 000 6zm7.4-3a7.4 7.4 0 00-.1-1.3l2-1.6-2-3.4-2.4 1a7.6 7.6 0 00-2.2-1.3L14.3 2h-4l-.4 2.4a7.6 7.6 0 00-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 000 2.6l-2 1.6 2 3.4 2.4-1c.7.5 1.4 1 2.2 1.3l.4 2.4h4l.4-2.4c.8-.3 1.5-.8 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3z' },
  ]
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

  return (
    <div className="min-h-dvh pb-20 md:pb-0">
      {/* Верхняя панель */}
      <header className="sticky top-0 z-10 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1800px] items-center gap-6 px-4 lg:px-8">
          <Logo />
          <nav className="hidden gap-1 md:flex">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                viewTransition
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${isActive ? 'bg-surface-2 text-text shadow-[inset_0_-2px_0_var(--color-primary)]' : 'text-muted hover:text-text'}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
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

      {/* Нижнее меню на телефоне */}
      <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
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
