/** «Данные и безопасность» — открывается без входа (ссылки: подвал главной и форма регистрации) */
import { Link } from 'react-router'
import { useT } from '@/i18n'
import { Logo } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LangSwitch } from '@/components/LangSwitch'

const wrap = 'mx-auto w-full max-w-[1320px] px-4 sm:px-6'

export function PrivacyPage() {
  const p = useT().privacy
  const sections = [p.sections.stored, p.sections.access, p.sections.keys, p.sections.yours, p.sections.third]
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border">
        <div className={`${wrap} flex h-14 items-center justify-between gap-4`}>
          <Link to="/" aria-label={p.back}>
            <Logo />
          </Link>
          <div className="flex items-center gap-1">
            <LangSwitch />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className={`${wrap} py-10 sm:py-14`}>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{p.title}</h1>
        <p className="mt-3 max-w-2xl text-text/80">{p.intro}</p>
        <div className="mt-10 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {sections.map((s) => (
            <section key={s.title} className="rounded-xl border border-border bg-surface p-5">
              <h2 className="text-lg font-semibold">{s.title}</h2>
              <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed text-text/85 marker:text-muted">
                {s.items.map((it) => (
                  <li key={it}>{it}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <Link to="/" className="mt-10 inline-block text-sm text-primary hover:underline">
          ← {p.back}
        </Link>
      </main>
    </div>
  )
}
