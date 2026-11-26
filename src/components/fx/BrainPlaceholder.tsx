/**
 * Заготовка «Мозга из сделок», пока грузятся сделки, файл сцены и сама сцена (владелец 26.11.2026:
 * плоская «Орбита» на секунду, потом резкая смена — «чтобы такого больше не было»).
 * Тихий круг с отблеском заготовки (skeleton) того же размера; плоская «Орбита» — только без WebGL.
 */
export function BrainPlaceholder({ size, className = '' }: { size: number; className?: string }) {
  const d = Math.round(size * 0.62)
  return (
    <div aria-hidden data-brain-placeholder className={`pointer-events-none grid place-items-center ${className}`} style={{ width: Math.round(size * 1.3), height: size, maxWidth: '100%' }}>
      <div className="skeleton rounded-full opacity-60" style={{ width: d, height: d }} />
    </div>
  )
}
