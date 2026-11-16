/**
 * №3 «Мерцающий текст» (образец — 21st.dev text-shimmer): по надписи «идёт работа» скользит мягкий блик.
 * Окно со светлой копией текста едет вправо (transform), а копия внутри — навстречу: блик бежит по неподвижным буквам.
 * Только transform; при «уменьшить движение» — обычный текст (окно скрыто).
 */
export function Shimmer({ children, className = '' }: { children: string; className?: string }) {
  return (
    <span className={`shimmer relative inline-block max-w-full ${className}`}>
      {children}
      <span aria-hidden className="shimmer-window">
        <span className="shimmer-copy">{children}</span>
      </span>
    </span>
  )
}
