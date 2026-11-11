/**
 * Блок «Подключённые биржи» на странице импорта: подключить Bybit (ключ «только чтение») или Hyperliquid (адрес кошелька),
 * синхронизировать вручную, отключить. Сами сделки подтягиваются автоматически (useAutoSync в AppLayout).
 */
import { intlLocale } from '@/lib/locale'
import { useState, type FormEvent } from 'react'
import { fmt, useT } from '@/i18n'
import type { Dict } from '@/i18n/ru'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { SelectField, TextField } from '@/components/ui/Field'
import { exchangeName } from '@/lib/exchanges'
import { dbErrorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { useUsage } from '@/features/settings/api'
import { activeConnections, connectBlock, connectionTypeOk, planFor, planInfo } from '@/lib/plans'
import { useIsAdmin } from '@/features/admin/api'
import { UpgradeLine } from '@/components/UpgradeLine'
import type { Plan } from '@/types/db'
import { PolymarketDemoDialog } from './PolymarketDemoDialog'
import { PasswordInput } from '@/components/PasswordInput'
import { SaveButton, type SaveState } from '@/components/SaveButton'
import { pause } from '@/lib/motion'
import {
  CONNECTABLE,
  SyncError,
  errorCodeOf,
  shortKey,
  useAddConnection,
  useConnections,
  useDeleteConnection,
  useSyncConnection,
  type ConnectableId,
  type Connection,
  type SyncResult,
} from './api'

/** Ошибка подключения / синхронизации → текст */
export function connectionError(e: unknown, t: Dict): string {
  const c = t.connections.errors as Record<string, string>
  if (e instanceof SyncError) return c[e.code] ?? c.UNKNOWN
  const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : ''
  for (const code of [
    'BAD_WALLET',
    'BAD_API_KEY',
    'CONNECTION_LIMIT_REACHED',
    'TOO_MANY_CONNECTIONS',
    'CONNECTION_EXISTS',
    'EXCHANGE_NOT_SUPPORTED',
    'PLAN_REQUIRED',
  ])
    if (msg.includes(code)) return c[code]
  return dbErrorMessage(e, t)
}

export function ConnectionsCard() {
  const t = useT()
  const c = t.connections
  const { data: conns = [], isLoading } = useConnections()
  const { data: usage } = useUsage()
  const { data: isAdmin } = useIsAdmin()
  const plan = usage?.plan
  const admin = Boolean(isAdmin)
  const pro = planInfo(plan).serverSync // Pro Plus: синхронизация на сервере каждые 3 часа
  // работают только подключения в пределах тарифа; остальные (Polymarket на Pro, сверх лимита) — на паузе, не удаляются
  const active = activeConnections(conns, plan, admin)
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  const onSynced = (r: SyncResult) =>
    setNotice({
      tone: 'success',
      text: [r.inserted ? fmt(c.syncedNew, { n: r.inserted }) : c.syncedNothing, r.overLimit ? fmt(c.syncedOverLimit, { n: r.overLimit }) : '']
        .filter(Boolean)
        .join(' '),
    })

  return (
    <Card className="flex flex-col gap-3 !p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">{c.title}</h2>
          <p className="mt-0.5 text-xs text-muted">{pro ? c.hintPro : c.hintFree}</p>
        </div>
        {!adding && (
          <Button variant="secondary" className="shrink-0 !px-3 !py-1.5 text-xs whitespace-nowrap" onClick={() => setAdding(true)}>
            {c.add}
          </Button>
        )}
      </div>

      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      {adding && (
        <AddForm
          count={conns.length}
          admin={admin}
          onDone={(name) => {
            setAdding(false)
            setNotice({ tone: 'success', text: fmt(c.added, { name }) })
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {isLoading ? (
        <p className="text-sm text-muted">{t.common.loading}</p>
      ) : conns.length === 0 ? (
        !adding && (
          <>
            <p className="text-sm text-muted">{c.empty}</p>
            {usage && !admin && planInfo(plan).connections === 0 && <UpgradeLine text={t.plans.upgrade.connectionsFree} />}
          </>
        )
      ) : (
        <ul className="flex flex-col">
          {conns.map((conn) => (
            <ConnectionRow
              key={conn.id}
              conn={conn}
              pro={pro}
              paused={!active.has(conn.id)}
              plan={plan}
              onSynced={onSynced}
              onError={(text) => setNotice({ tone: 'error', text })}
            />
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">{t.exchange.soon}</p>
    </Card>
  )
}

/** Почему нельзя подключить — одна строка с предложением тарифа */
function upgradeText(t: Dict, block: 'type' | 'limit', exchange: string, plan: Plan | undefined): string {
  const u = t.plans.upgrade
  if (block === 'type') return exchange === 'polymarket' && plan === 'pro' ? u.polymarket : planInfo(plan).connections === 0 ? u.connectionsFree : u.polymarket
  return plan === 'pro_plus' ? u.connectionsMax : u.connectionsPro
}

/** Подключение на паузе: какой тариф нужен (Basic → тариф для этого типа, Pro → Pro Plus; на Pro Plus — сверх 5) */
function pausedText(t: Dict, exchange: string, plan: Plan | undefined): string {
  if (plan === 'pro_plus') return t.connections.pausedMax
  const need: Plan = plan === 'pro' ? 'pro_plus' : planFor(exchange)
  return fmt(t.connections.paused, { plan: t.plans.names[need] })
}

const DAY_MS = 86_400_000
const dateOnly = () => new Intl.DateTimeFormat(intlLocale(), { day: 'numeric', month: 'long' })

function ConnectionRow({
  conn,
  pro,
  paused,
  plan,
  onSynced,
  onError,
}: {
  conn: Connection
  pro: boolean
  /** не по тарифу — синхронизация не идёт («нужен Pro Plus»), подключение не удаляется */
  paused: boolean
  plan: Plan | undefined
  onSynced: (r: SyncResult) => void
  onError: (text: string) => void
}) {
  const t = useT()
  const c = t.connections
  const sync = useSyncConnection()
  const del = useDeleteConnection()
  const code = errorCodeOf(conn.last_error)
  const errText = code ? ((c.errors as Record<string, string>)[code] ?? c.errors.UNKNOWN) : null
  // ключ Bybit без привязки к IP живёт 90 дней — предупреждаем за 14
  const expiresMs = conn.key_expires_at ? Date.parse(conn.key_expires_at) : null
  const expiry =
    expiresMs === null
      ? null
      : expiresMs < Date.now()
        ? { tone: 'text-loss', text: c.keyExpired }
        : expiresMs - Date.now() < 14 * DAY_MS
          ? { tone: 'text-warning', text: fmt(c.keyExpiresSoon, { date: dateOnly().format(new Date(expiresMs)) }) }
          : null

  return (
    <li className="flex flex-col gap-2 border-t border-border py-3 first:border-t-0 first:pt-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span
              className={`size-2 shrink-0 rounded-full ${paused ? 'bg-muted' : errText ? 'bg-loss' : conn.last_sync_at ? 'bg-profit' : 'bg-muted'}`}
              aria-hidden
            />
            {exchangeName(conn.exchange, t.exchange.other)}
            <span className="num truncate text-xs font-normal text-muted">{conn.label ?? shortKey(conn.api_key)}</span>
          </div>
          <div className="mt-0.5 text-xs text-muted">
            {sync.isPending ? c.syncing : conn.last_sync_at ? fmt(c.lastSync, { date: formatDateTime(conn.last_sync_at) }) : c.neverSynced}
            {!sync.isPending && pro && !errText && !paused && <span> · {c.autoPro}</span>}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            variant="secondary"
            className="!px-2.5 !py-1.5 text-xs"
            loading={sync.isPending}
            disabled={paused}
            onClick={() => sync.mutate(conn, { onSuccess: onSynced, onError: (e) => onError(connectionError(e, t)) })}
          >
            {c.sync}
          </Button>
          <Button
            variant="ghost"
            className="!px-2.5 !py-1.5 text-xs"
            loading={del.isPending}
            onClick={() => {
              if (window.confirm(c.removeConfirm)) del.mutate(conn.id, { onError: (e) => onError(connectionError(e, t)) })
            }}
          >
            {c.remove}
          </Button>
        </div>
      </div>
      {paused && <UpgradeLine className="!text-xs" text={pausedText(t, conn.exchange, plan)} />}
      {errText && !sync.isPending && !paused && <p className="text-xs text-loss">{errText}</p>}
      {expiry && !errText && <p className={`text-xs ${expiry.tone}`}>{expiry.text}</p>}
    </li>
  )
}

function AddForm({ count, admin, onDone, onCancel }: { count: number; admin: boolean; onDone: (name: string) => void; onCancel: () => void }) {
  const t = useT()
  const c = t.connections
  const add = useAddConnection()
  const sync = useSyncConnection()
  const { data: usage } = useUsage()
  const plan = usage?.plan
  // по умолчанию — первое подключение, доступное на тарифе
  const [exchange, setExchange] = useState<ConnectableId>(() => CONNECTABLE.find((x) => admin || connectionTypeOk(x.id, plan))?.id ?? 'bybit')
  const block = connectBlock(exchange, plan, count, admin)
  const allowed = block === null
  const [apiKey, setApiKey] = useState('')
  const [secret, setSecret] = useState('')
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [demo, setDemo] = useState(false)
  // №15: «Подключить» — крутилка в круге (идёт проверка ключа), галочка цветом прибыли
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const kind = CONNECTABLE.find((x) => x.id === exchange)!.kind

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSaveState('busy')
    try {
      const id = await add.mutateAsync({ exchange, apiKey, secret: kind === 'cex' ? secret : undefined, label })
      setSecret('')
      // сразу первая синхронизация (ошибку покажет строка подключения) — до паузы на галочку, чтобы автосинхронизация не начала её второй раз
      sync.mutate({
        id,
        exchange,
        label: label.trim() || null,
        api_key: kind === 'wallet' ? apiKey.trim().toLowerCase() : apiKey.trim(),
        last_sync_at: null,
        cursor_at: null,
        last_error: null,
        key_expires_at: null,
        created_at: '',
      })
      setSaveState('done')
      await pause(600)
      onDone(exchangeName(exchange, ''))
    } catch (err) {
      setSaveState('idle')
      setError(connectionError(err, t))
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2/40 p-3">
      <SelectField label={c.exchange} value={exchange} onChange={(e) => setExchange(e.target.value as ConnectableId)}>
        {CONNECTABLE.map((x) => (
          <option key={x.id} value={x.id}>
            {exchangeName(x.id, '')} · {c.kind[x.kind]}
            {admin || connectionTypeOk(x.id, plan) ? '' : ` · ${t.plans.names[planFor(x.id)]}`}
          </option>
        ))}
      </SelectField>

      <details className="text-xs text-muted" open>
        <summary className="cursor-pointer text-text">{c.howTitle}</summary>
        <ol className="mt-2 flex list-decimal flex-col gap-1 pl-4">
          {(c.how as Record<string, readonly string[]>)[exchange].map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </details>

      {exchange === 'polymarket' && (
        <>
          <Button type="button" variant="secondary" className="!py-2 text-xs" onClick={() => setDemo(true)}>
            {c.demo.open}
          </Button>
          <PolymarketDemoDialog open={demo} onClose={() => setDemo(false)} />
        </>
      )}

      {!allowed ? (
        <UpgradeLine text={upgradeText(t, block!, exchange, plan)} />
      ) : (
        <>
          {kind === 'cex' ? (
            <>
              <TextField label={c.apiKey} value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" spellCheck={false} required />
              <PasswordInput
                label={c.secret}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                autoComplete="new-password"
                required
                hint={c.secretHint}
              />
            </>
          ) : (
            <TextField
              label={c.wallet}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="0x…"
              autoComplete="off"
              spellCheck={false}
              required
              hint={exchange === 'polymarket' ? c.walletHintPolymarket : c.walletHint}
            />
          )}
          <TextField label={c.label} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder={c.labelPlaceholder} />
        </>
      )}

      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t.common.cancel}
        </Button>
        <SaveButton state={saveState} disabled={!allowed}>
          {c.connect}
        </SaveButton>
      </div>
    </form>
  )
}
