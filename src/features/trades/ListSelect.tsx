import { useState } from 'react'
import { useT } from '@/i18n'
import { useList, useListMutations } from '@/features/settings/api'
import { SelectField, controlClass } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import type { ListKind } from '@/types/db'

const ADD = '__add__'

/** Выпадающий список (сетап/эмоция) с возможностью дописать свой вариант */
export function ListSelect({ kind, label, value, onChange }: { kind: ListKind; label: string; value: string; onChange: (id: string) => void }) {
  const t = useT()
  const { data: items = [] } = useList(kind)
  const { add } = useListMutations(kind)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')

  async function submit() {
    if (!name.trim()) return
    const item = await add.mutateAsync(name)
    onChange(item.id)
    setName('')
    setAdding(false)
  }

  if (adding) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm text-muted">{label}</span>
        <div className="flex gap-2">
          <input
            autoFocus
            value={name}
            maxLength={50}
            placeholder={t.tradeForm.newItemPlaceholder}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              }
              if (e.key === 'Escape') setAdding(false)
            }}
            className={controlClass}
          />
          <Button type="button" onClick={submit} loading={add.isPending} className="shrink-0">
            {t.common.add}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setAdding(false)} className="shrink-0 px-2" aria-label={t.common.cancel}>
            ✕
          </Button>
        </div>
      </div>
    )
  }

  // скрытые варианты не предлагаем, но если уже выбран — показываем
  const visible = items.filter((i) => !i.archived || i.id === value)
  return (
    <SelectField label={label} value={value} onChange={(e) => (e.target.value === ADD ? setAdding(true) : onChange(e.target.value))}>
      <option value="">{t.common.none}</option>
      {visible.map((i) => (
        <option key={i.id} value={i.id}>
          {i.name}
        </option>
      ))}
      <option value={ADD}>{t.tradeForm.addOwn}</option>
    </SelectField>
  )
}
