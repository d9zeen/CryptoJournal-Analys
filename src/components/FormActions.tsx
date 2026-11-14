import { useT } from '@/i18n'
import { Button } from '@/components/ui/Button'
import { SaveButton, type SaveState } from '@/components/SaveButton'

/** Низ формы, как в образце: «Отмена / Сохранить» справа; обе неактивны, пока ничего не поменяли */
export function FormActions({ dirty, state, onCancel, label }: { dirty: boolean; state: SaveState; onCancel: () => void; label?: string }) {
  const t = useT()
  return (
    <div data-form-actions className="flex justify-end gap-2 border-t border-border pt-4">
      <Button type="button" variant="ghost" disabled={!dirty || state !== 'idle'} onClick={onCancel}>
        {t.common.cancel}
      </Button>
      <SaveButton state={state} disabled={!dirty}>
        {label ?? t.common.save}
      </SaveButton>
    </div>
  )
}
