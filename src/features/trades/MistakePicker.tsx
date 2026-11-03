import { useState } from 'react'
import { useT } from '@/i18n'
import { useList, useListMutations } from '@/features/settings/api'
import { Chip } from '@/components/ui/Chip'

/** Теги ошибок: нажми, чтобы отметить; можно добавить свой */
export function MistakePicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const t = useT()
  const { data: tags = [] } = useList('mistake_tags')
  const { add } = useListMutations('mistake_tags')
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])

  async function submit() {
    setAdding(false)
    if (!name.trim()) return
    const item = await add.mutateAsync(name)
    onChange([...value, item.id])
    setName('')
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm text-muted">{t.tradeForm.mistakes}</span>
      <div className="flex flex-wrap gap-2">
        {tags
          .filter((tag) => !tag.archived || value.includes(tag.id))
          .map((tag) => (
            <Chip key={tag.id} active={value.includes(tag.id)} onClick={() => toggle(tag.id)}>
              {tag.name}
            </Chip>
          ))}
        {adding ? (
          <input
            autoFocus
            value={name}
            maxLength={50}
            placeholder={t.tradeForm.newItemPlaceholder}
            onChange={(e) => setName(e.target.value)}
            onBlur={submit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              }
              if (e.key === 'Escape') setAdding(false)
            }}
            className="w-40 rounded-full border border-primary bg-surface-2 px-3 py-1 text-sm outline-none"
          />
        ) : (
          <Chip onClick={() => setAdding(true)} className="border-dashed">
            {t.tradeForm.addMistake}
          </Chip>
        )}
      </div>
    </div>
  )
}
