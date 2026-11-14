/**
 * Окно подтверждения на <dialog> (Esc и клик вне окна закрывают): заголовок, текст, «Отмена» и опасная кнопка.
 * Открыто, пока open = true; закрытие любым способом вызывает onClose.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Button } from './Button'

type Props = {
  open: boolean
  title: string
  children?: ReactNode
  confirm: string
  cancel: string
  loading?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({ open, title, children, confirm, cancel, loading, onConfirm, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      className="m-auto w-[min(420px,calc(100%-32px))] rounded-2xl border border-border bg-surface p-5 text-text shadow-2xl backdrop:bg-bg/70"
    >
      <h2 id={titleId} className="font-semibold">
        {title}
      </h2>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => ref.current?.close()}>
          {cancel}
        </Button>
        <Button variant="danger" loading={loading} onClick={onConfirm}>
          {confirm}
        </Button>
      </div>
    </dialog>
  )
}
