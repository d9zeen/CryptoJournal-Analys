import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fmt, useT } from '@/i18n'
import { compressImage, screenshotUrls } from './screenshot'
import { useUsage } from '@/features/settings/api'
import { planInfo } from '@/lib/plans'
import { UpgradeLine } from '@/components/UpgradeLine'
import { Button } from '@/components/ui/Button'
import { ImageViewer } from './ImageViewer'
import type { TradeScreenshot } from '@/types/db'

type Props = {
  /** сохранённые скриншоты (без отмеченных на удаление) */
  saved: TradeScreenshot[]
  /** новые, ещё не загруженные */
  pending: Blob[]
  onAdd: (blobs: Blob[]) => void
  onRemoveSaved: (s: TradeScreenshot) => void
  onRemovePending: (index: number) => void
}

/** Скриншоты сделки: несколько штук, перетаскивание, выбор файлов, вставка Ctrl+V, просмотр на весь экран. */
export function ScreenshotsField({ saved, pending, onAdd, onRemoveSaved, onRemovePending }: Props) {
  const t = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [viewIndex, setViewIndex] = useState<number | null>(null)
  // на Basic — 2 скриншота на сделку, на Pro и Pro Plus — 10 (то же проверяет база, 0016); админ — Pro Plus
  const { data: usage } = useUsage()
  const max = planInfo(usage?.plan).screenshots
  const free = max - saved.length - pending.length

  const { data: savedUrls } = useQuery({
    queryKey: ['screenshotUrls', saved.map((s) => s.path)],
    enabled: saved.length > 0,
    staleTime: 50 * 60_000, // ссылки живут час
    queryFn: () => screenshotUrls(saved.map((s) => s.path)),
  })

  const pendingUrls = useMemo(() => pending.map((b) => URL.createObjectURL(b)), [pending])
  useEffect(() => () => pendingUrls.forEach((u) => URL.revokeObjectURL(u)), [pendingUrls])

  const items = [
    ...saved.map((s) => ({ key: s.id, url: savedUrls?.get(s.path) ?? null, isNew: false, remove: () => onRemoveSaved(s) })),
    ...pending.map((_, i) => ({ key: `new-${i}`, url: pendingUrls[i], isNew: true, remove: () => onRemovePending(i) })),
  ]

  // актуальные значения для обработчика вставки, который вешается один раз
  const latest = useRef({ free, onAdd })
  latest.current = { free, onAdd }

  async function handleFiles(files: File[]) {
    const images = files.filter((f) => f.type.startsWith('image/')).slice(0, Math.max(0, latest.current.free))
    if (!images.length) return
    setError(false)
    setProcessing(true)
    try {
      latest.current.onAdd(await Promise.all(images.map((f) => compressImage(f))))
    } catch {
      setError(true)
    } finally {
      setProcessing(false)
    }
  }

  // вставка из буфера обмена (Ctrl+V) в любом месте страницы
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'))
      if (files.length) {
        e.preventDefault()
        void handleFiles(files)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-muted">{t.tradeForm.screenshot}</span>

      {items.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {items.map((it, i) => (
            <li key={it.key} className="relative overflow-hidden rounded-lg border border-border bg-surface-2">
              <button
                type="button"
                className="block aspect-video w-full"
                onClick={() => setViewIndex(i)}
                aria-label={fmt(t.tradeForm.viewerCount, { i: i + 1, n: items.length })}
              >
                {it.url ? <img src={it.url} alt="" className="size-full object-cover" loading="lazy" /> : <span className="block size-full animate-pulse" />}
              </button>
              {it.isNew && (
                <span className="absolute left-1.5 top-1.5 rounded bg-primary px-1.5 py-0.5 text-xs text-on-primary">{t.tradeForm.screenshotNew}</span>
              )}
              <button
                type="button"
                onClick={it.remove}
                className="absolute right-1.5 top-1.5 rounded bg-bg/80 px-2 py-0.5 text-xs text-text hover:bg-loss hover:text-on-primary"
              >
                {t.tradeForm.screenshotRemove}
              </button>
            </li>
          ))}
        </ul>
      )}

      {free > 0 ? (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            void handleFiles(Array.from(e.dataTransfer.files))
          }}
          className={`flex flex-col items-center gap-3 rounded-lg border border-dashed p-5 text-center text-sm text-muted transition-colors ${dragOver ? 'border-primary bg-primary/5' : 'border-border'}`}
        >
          <p>{processing ? t.tradeForm.screenshotProcessing : fmt(t.tradeForm.screenshotHint, { max })}</p>
          <Button type="button" variant="secondary" onClick={() => inputRef.current?.click()} loading={processing}>
            {items.length ? t.tradeForm.screenshotAdd : t.tradeForm.screenshotPick}
          </Button>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted">{fmt(t.tradeForm.screenshotsFull, { max })}</p>
          {max < planInfo('pro').screenshots && <UpgradeLine text={t.plans.upgrade.screenshots} />}
        </>
      )}
      {error && <p className="text-xs text-loss">{t.tradeForm.screenshotError}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          void handleFiles(Array.from(e.target.files ?? []))
          e.target.value = ''
        }}
      />

      {viewIndex !== null && <ImageViewer urls={items.map((it) => it.url)} index={viewIndex} onIndex={setViewIndex} onClose={() => setViewIndex(null)} />}
    </div>
  )
}
