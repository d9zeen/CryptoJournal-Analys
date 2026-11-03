import { useState } from 'react'
import { fmt, useT } from '@/i18n'
import { useList, useListMutations } from './api'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { controlClass } from '@/components/ui/Field'
import { dbErrorMessage } from '@/lib/errors'
import type { ListItem, ListKind } from '@/types/db'

/** Редактор личного списка: сетапы, теги ошибок, эмоции */
export function ListEditor({ kind }: { kind: ListKind }) {
  const t = useT()
  const { data: items = [], isLoading } = useList(kind)
  const { add, update, remove } = useListMutations(kind)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(dbErrorMessage(e, t))
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="font-medium">{t.settings.lists[kind]}</h2>
        <p className="text-sm text-muted">{t.settings.lists[`${kind}Hint`]}</p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {isLoading ? (
        <p className="text-sm text-muted">{t.common.loading}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {items.map((item) => (
            <Row
              key={item.id}
              item={item}
              onRename={(n) => run(() => update.mutateAsync({ id: item.id, name: n }))}
              onArchive={() => run(() => update.mutateAsync({ id: item.id, archived: !item.archived }))}
              onDelete={() => window.confirm(fmt(t.settings.lists.deleteConfirm, { name: item.name })) && run(() => remove.mutateAsync(item.id))}
            />
          ))}
        </ul>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          run(async () => {
            await add.mutateAsync(name)
            setName('')
          })
        }}
      >
        <input value={name} maxLength={50} onChange={(e) => setName(e.target.value)} placeholder={t.settings.lists.addPlaceholder} className={controlClass} aria-label={t.settings.lists.addPlaceholder} />
        <Button type="submit" loading={add.isPending} className="shrink-0">
          {t.common.add}
        </Button>
      </form>
    </Card>
  )
}

function Row({ item, onRename, onArchive, onDelete }: { item: ListItem; onRename: (name: string) => void; onArchive: () => void; onDelete: () => void }) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(item.name)

  const commit = () => {
    setEditing(false)
    if (value.trim() && value.trim() !== item.name) onRename(value.trim())
    else setValue(item.name)
  }

  return (
    <li className="flex items-center gap-2 py-2">
      {editing ? (
        <input
          autoFocus
          value={value}
          maxLength={50}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') {
              setValue(item.name)
              setEditing(false)
            }
          }}
          className={`${controlClass} py-1.5`}
        />
      ) : (
        <button type="button" onClick={() => setEditing(true)} title={t.settings.lists.rename} className={`min-w-0 flex-1 truncate text-left ${item.archived ? 'text-muted line-through' : ''}`}>
          {item.name}
        </button>
      )}
      <div className="flex shrink-0 gap-1">
        <button type="button" onClick={onArchive} className="rounded px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-text">
          {item.archived ? t.settings.lists.unarchive : t.settings.lists.archive}
        </button>
        <button type="button" onClick={onDelete} className="rounded px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-loss" aria-label={`${t.common.delete} ${item.name}`}>
          {t.common.delete}
        </button>
      </div>
    </li>
  )
}
