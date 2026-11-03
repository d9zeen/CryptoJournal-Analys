import { useEffect } from 'react'
import { fmt, useT } from '@/i18n'

type Props = {
  urls: (string | null)[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
}

/** Просмотр картинок на весь экран: стрелки ← →, Esc, свайп не нужен — кнопки крупные. */
export function ImageViewer({ urls, index, onIndex, onClose }: Props) {
  const t = useT()
  const n = urls.length
  const go = (d: number) => onIndex((index + d + n) % n)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && n > 1) onIndex((index - 1 + n) % n)
      if (e.key === 'ArrowRight' && n > 1) onIndex((index + 1) % n)
    }
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [index, n, onIndex, onClose])

  const url = urls[index]
  const btn = 'rounded-full bg-surface-2/90 px-4 py-2 text-lg text-text hover:bg-surface'
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex flex-col bg-bg/95" onClick={onClose}>
      <div className="flex items-center justify-between p-3 text-sm text-muted">
        <span>{n > 1 ? fmt(t.tradeForm.viewerCount, { i: index + 1, n }) : ''}</span>
        <button type="button" className={btn} onClick={onClose} aria-label={t.tradeForm.viewerClose}>
          ✕
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-2 pb-4">
        {url && (
          <a href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="max-h-full">
            <img src={url} alt="" className="max-h-[80dvh] max-w-full rounded-lg object-contain" />
          </a>
        )}
      </div>
      {n > 1 && (
        <div className="flex justify-center gap-4 pb-6" onClick={(e) => e.stopPropagation()}>
          <button type="button" className={btn} onClick={() => go(-1)} aria-label={t.tradeForm.viewerPrev}>
            ←
          </button>
          <button type="button" className={btn} onClick={() => go(1)} aria-label={t.tradeForm.viewerNext}>
            →
          </button>
        </div>
      )}
    </div>
  )
}
