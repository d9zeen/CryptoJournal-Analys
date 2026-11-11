import { Link } from 'react-router'
import { useT } from '@/i18n'

/** Предложение апгрейда — одна строка текста и ссылка «Тарифы» (без всплывающих окон) */
export function UpgradeLine({ text, className = '' }: { text: string; className?: string }) {
  const t = useT()
  return (
    <p data-upgrade className={`flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm ${className}`}>
      <span className="text-muted">{text}</span>
      <Link to="/plans" className="font-medium text-primary hover:underline">
        {t.plans.title}
      </Link>
    </p>
  )
}
