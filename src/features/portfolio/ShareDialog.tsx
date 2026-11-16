/**
 * Окно «Поделиться портфелем» (образец — 21st.dev the-dialog/share-link: заголовок, пояснение, поле со ссылкой и кнопка «Копировать»
 * с галочкой на 2 секунды). Наше: переключатель «Показывать суммы» (по умолчанию выключен), «Новая ссылка» и «Выключить ссылку».
 * <dialog> как у «Добавить монету»: на телефоне — лист снизу, от 768px — по центру.
 */
import { useEffect, useRef, useState } from 'react'
import { useT } from '@/i18n'
import { Button } from '@/components/ui/Button'
import { CheckMark } from '@/components/CheckMark'
import { dbErrorMessage } from '@/lib/errors'
import { shareUrl, useSetShare, useShare, useUnshare } from './shareApi'

export function ShareDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  const s = t.portfolio.share
  const ref = useRef<HTMLDialogElement>(null)
  const { data: share, isLoading } = useShare()
  const set = useSetShare()
  const unshare = useUnshare()
  const [copied, setCopied] = useState(false)
  // переключатель отвечает сразу (не ждёт ответа базы); ошибка — возвращается как было
  const [amountsLocal, setAmountsLocal] = useState<boolean | null>(null)
  const amounts = amountsLocal ?? share?.show_amounts ?? false
  useEffect(() => {
    const el = ref.current
    if (el && !el.open) el.showModal()
  }, [])
  const close = () => ref.current?.close()
  const url = share ? shareUrl(share.token) : ''
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      /* буфер недоступен — ссылка выделена в поле, можно скопировать руками */
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }
  const error = set.error ?? unshare.error
  return (
    <dialog
      ref={ref}
      data-share-dialog
      aria-labelledby="share-title"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && close()}
      className="day-sheet mx-0 mt-auto mb-0 max-h-[88dvh] w-full max-w-none rounded-t-2xl border border-border bg-surface p-0 text-text shadow-2xl backdrop:bg-bg/60 md:m-auto md:max-w-md md:rounded-2xl"
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          <h2 id="share-title" className="text-lg font-semibold">
            {s.title}
          </h2>
          <p className="text-sm text-muted">{share ? s.textOn : s.textOff}</p>
        </div>

        {share ? (
          <>
            <div className="flex items-center gap-2">
              <label htmlFor="share-url" className="sr-only">
                {s.url}
              </label>
              <input
                id="share-url"
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                className="num min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs focus:border-primary focus:outline-none"
              />
              <Button type="button" variant="secondary" onClick={() => void copy()} aria-label={copied ? s.copied : s.copy} className="shrink-0">
                {copied ? <CheckMark className="size-4 text-up" /> : s.copy}
              </Button>
            </div>
            <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
              <span className="flex flex-col">
                <span>{s.amounts}</span>
                <span className="text-xs text-muted">{amounts ? s.amountsOn : s.amountsOff}</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={amounts}
                onChange={(e) => {
                  const v = e.target.checked
                  setAmountsLocal(v)
                  set.mutate({ showAmounts: v }, { onError: () => setAmountsLocal(null) })
                }}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className="relative h-5 w-9 shrink-0 rounded-full bg-surface-2 transition-colors peer-checked:bg-primary peer-focus-visible:outline-2 peer-focus-visible:outline-primary after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-surface after:transition-transform peer-checked:after:translate-x-4"
              />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
              <div className="flex gap-1">
                <Button type="button" variant="ghost" className="!px-2 text-xs" onClick={() => set.mutate({ showAmounts: amounts, renew: true })} disabled={set.isPending}>
                  {s.renew}
                </Button>
                <Button type="button" variant="ghost" className="!px-2 text-xs text-down" onClick={() => unshare.mutate()} disabled={unshare.isPending}>
                  {s.off}
                </Button>
              </div>
              <Button type="button" variant="secondary" onClick={close}>
                {s.close}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close}>
              {s.close}
            </Button>
            <Button type="button" loading={set.isPending} disabled={isLoading} onClick={() => set.mutate({ showAmounts: false })}>
              {s.create}
            </Button>
          </div>
        )}
        {error && <p className="text-sm text-down">{dbErrorMessage(error, t)}</p>}
      </div>
    </dialog>
  )
}
