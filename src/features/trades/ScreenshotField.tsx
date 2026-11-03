import { useEffect, useRef, useState } from 'react'
import { useT } from '@/i18n'
import { compressImage, screenshotUrl } from './screenshot'
import { Button } from '@/components/ui/Button'

type Props = {
  /** путь уже сохранённого скриншота */
  existingPath: string | null
  /** новый скриншот: Blob — заменить, null — удалить, undefined — без изменений */
  value: Blob | null | undefined
  onChange: (v: Blob | null | undefined) => void
}

export function ScreenshotField({ existingPath, value, onChange }: Props) {
  const t = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  // превью: новый файл или уже сохранённый
  useEffect(() => {
    let revoke: string | null = null
    let cancelled = false
    if (value) {
      revoke = URL.createObjectURL(value)
      setPreview(revoke)
    } else if (value === undefined && existingPath) {
      screenshotUrl(existingPath).then((url) => !cancelled && setPreview(url))
    } else {
      setPreview(null)
    }
    return () => {
      cancelled = true
      if (revoke) URL.revokeObjectURL(revoke)
    }
  }, [value, existingPath])

  async function handleFile(file: File | null | undefined) {
    if (!file || !file.type.startsWith('image/')) return
    setError(false)
    setProcessing(true)
    try {
      onChange(await compressImage(file))
    } catch {
      setError(true)
    } finally {
      setProcessing(false)
    }
  }

  // вставка из буфера обмена (Ctrl+V) в любом месте страницы
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'))
      if (file) {
        e.preventDefault()
        handleFile(file)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm text-muted">{t.tradeForm.screenshot}</span>
      {preview ? (
        <div className="flex flex-col gap-2">
          <a href={preview} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-border">
            <img src={preview} alt={t.tradeForm.screenshot} className="max-h-96 w-full object-contain" />
          </a>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => inputRef.current?.click()}>
              {t.tradeForm.screenshotPick}
            </Button>
            <Button type="button" variant="ghost" onClick={() => onChange(existingPath ? null : undefined)}>
              {t.tradeForm.screenshotRemove}
            </Button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            handleFile(e.dataTransfer.files[0])
          }}
          className={`flex flex-col items-center gap-3 rounded-lg border border-dashed p-6 text-center text-sm text-muted transition-colors ${dragOver ? 'border-primary bg-primary/5' : 'border-border'}`}
        >
          <p>{processing ? t.tradeForm.screenshotProcessing : t.tradeForm.screenshotHint}</p>
          <Button type="button" variant="secondary" onClick={() => inputRef.current?.click()} loading={processing}>
            {t.tradeForm.screenshotPick}
          </Button>
        </div>
      )}
      {error && <p className="text-xs text-loss">{t.tradeForm.screenshotError}</p>}
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
    </div>
  )
}
