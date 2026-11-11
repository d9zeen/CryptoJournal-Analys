/**
 * №14 Загрузка без пустоты: серые заготовки с мягким бегущим отблеском (utility skeleton в theme.css),
 * повторяют раскладку страницы. Потом содержимое плавно проявляется (animate-fade-in).
 */
import { useT } from '@/i18n'

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`skeleton ${className}`} />
}

/** Обёртка: экранным читалкам — «Загрузка…», глазам — заготовки */
function Loading({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const t = useT()
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{t.common.loading}</span>
      {children}
    </div>
  )
}

/** Карточка-заготовка */
function Box({ className = '', children }: { className?: string; children?: React.ReactNode }) {
  return <div className={`flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-4 ${className}`}>{children}</div>
}

/** Дашборд: ряд показателей + график */
export function DashboardSkeleton() {
  return (
    <Loading className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-[minmax(0,1.35fr)_repeat(4,minmax(0,1fr))]">
        <Box className="col-span-2 md:col-span-4 xl:col-span-1">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-8 w-full" />
        </Box>
        {[0, 1, 2, 3].map((i) => (
          <Box key={i}>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-4 w-16" />
          </Box>
        ))}
      </div>
      <Box>
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-[300px] w-full" />
      </Box>
    </Loading>
  )
}

/** Сделки: строки таблицы (компьютер) или карточки (телефон) */
export function TradesSkeleton({ cards = false }: { cards?: boolean }) {
  const rows = Array.from({ length: 8 }, (_, i) => i)
  if (cards)
    return (
      <Loading className="flex flex-col gap-2">
        {rows.map((i) => (
          <Box key={i} className="!flex-row items-center justify-between">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-40" />
            </div>
            <Skeleton className="h-5 w-20" />
          </Box>
        ))}
      </Loading>
    )
  return (
    <Loading className="overflow-hidden rounded-lg border border-border bg-surface">
      {rows.map((i) => (
        <div key={i} className="flex items-center gap-4 border-t border-border px-4 py-3.5 first:border-t-0">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="ml-auto h-4 w-20" />
        </div>
      ))}
    </Loading>
  )
}

/** Календарь: сетка месяца */
export function CalendarSkeleton() {
  return (
    <Loading className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Box>
        <Skeleton className="h-5 w-44" />
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: 35 }, (_, i) => (
            <Skeleton key={i} className="h-14 xl:h-24" />
          ))}
        </div>
      </Box>
      <Box className="hidden xl:flex">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </Box>
    </Loading>
  )
}

/** Разбор: несколько таблиц */
export function AnalysisSkeleton() {
  return (
    <Loading className="grid gap-4 xl:grid-cols-2">
      {[0, 1, 2, 3].map((i) => (
        <Box key={i}>
          <Skeleton className="h-4 w-32" />
          {[0, 1, 2, 3].map((j) => (
            <div key={j} className="flex items-center gap-3">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </Box>
      ))}
    </Loading>
  )
}

/** Общая заготовка страницы — пока грузится код раздела (lazyPage в App.tsx) */
export function PageSkeleton() {
  return (
    <Loading className="flex flex-col gap-4">
      <Skeleton className="h-7 w-48" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Box key={i}>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </Box>
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </Loading>
  )
}
