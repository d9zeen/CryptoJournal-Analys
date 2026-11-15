/**
 * Блок «Подключённые биржи» на странице «Биржи»: каждое подключение — карточка со статусом (Работает / Ошибка / На паузе / Синхронизация…),
 * временем обновления, «Обновить» и «Отключить» (с подтверждением). Ниже — бледные карточки бирж «скоро по API».
 * Подключить: Bybit, Binance, OKX, BingX, Bitget (ключ «только чтение»; у OKX и Bitget — ещё кодовая фраза), Hyperliquid / Polymarket (адрес).
 * Сделки подтягиваются сами (useAutoSync в AppLayout).
 */
import { intlLocale } from '@/lib/locale'
import { useEffect, useState, type FormEvent } from 'react'
import { fmt, useT } from '@/i18n'
import type { Dict } from '@/i18n/ru'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { SelectField, TextField } from '@/components/ui/Field'
import { exchangeName } from '@/lib/exchanges'
import { dbErrorMessage } from '@/lib/errors'
import { formatDuration } from '@/lib/format'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
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
  NEEDS_PASSPHRASE,
  SyncError,
  errorCodeOf,
  shortKey,
  useAddConnection,
  useConnections,
  useDeleteConnection,
  useSyncConnection,
  useSyncing,
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
    'PASSPHRASE_REQUIRED',
    'CONNECTION_LIMIT_REACHED',
    'TOO_MANY_CONNECTIONS',
    'CONNECTION_EXISTS',
    'EXCHANGE_NOT_SUPPORTED',
    'PLAN_REQUIRED',
  ])
    if (msg.includes(code)) return c[code]
  return dbErrorMessage(e, t)
}

/** Биржи, которые скоро можно будет подключить по API (имена собственные — не переводятся) */
const SOON = ['MEXC', 'Lighter'] as const

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
  const now = useNow()

  const onSynced = (r: SyncResult) =>
    setNotice({
      tone: 'success',
      text: [r.inserted ? fmt(c.syncedNew, { n: r.inserted }) : c.syncedNothing, r.overLimit ? fmt(c.syncedOverLimit, { n: r.overLimit }) : '']
        .filter(Boolean)
        .join(' '),
    })

  return (
    <section aria-labelledby="connections-title" className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="connections-title" className="font-semibold">
            {c.title}
          </h2>
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
        <Card className="!p-4">
          <AddForm
            count={conns.length}
            admin={admin}
            onDone={(name) => {
              setAdding(false)
              setNotice({ tone: 'success', text: fmt(c.added, { name }) })
            }}
            onCancel={() => setAdding(false)}
          />
        </Card>
      )}

      {isLoading ? (
        <p className="text-sm text-muted">{t.common.loading}</p>
      ) : conns.length === 0 ? (
        !adding && (
          <Card className="!p-4">
            <p className="text-sm text-muted">{c.empty}</p>
            {usage && !admin && planInfo(plan).connections === 0 && <UpgradeLine className="mt-2" text={t.plans.upgrade.connectionsFree} />}
          </Card>
        )
      ) : (
        // каждое подключение — своя карточка: 1 колонка на телефоне, 2 — от sm, 3 — от xl
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {conns.map((conn) => (
            <ConnectionTile
              key={conn.id}
              conn={conn}
              pro={pro}
              paused={!active.has(conn.id)}
              plan={plan}
              now={now}
              onSynced={onSynced}
              onError={(text) => setNotice({ tone: 'error', text })}
            />
          ))}
        </ul>
      )}

      {/* «скоро по API» — такими же карточками, только бледными и без кнопок */}
      <ul aria-label={c.soonTitle} className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {SOON.map((name) => (
          <li key={name} data-soon={name} className="flex flex-col gap-1 rounded-xl border border-border bg-surface px-3 py-2.5 opacity-60">
            <span className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium">{name}</span>
              <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{c.soonBadge}</span>
            </span>
            <span className="text-xs text-muted">{c.soonHint}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Текущее время, обновляется раз в минуту — для «обновлено 20 мин назад» */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  return now
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
/** сервер Pro Plus синхронизирует раз в 3 часа */
const SERVER_EVERY_MS = 3 * 3_600_000
const dateOnly = () => new Intl.DateTimeFormat(intlLocale(), { day: 'numeric', month: 'long' })

type Status = 'ok' | 'error' | 'paused' | 'syncing' | 'waiting'
const PILL: Record<Status, string> = {
  ok: 'bg-up/12 text-up',
  error: 'bg-down/12 text-down',
  paused: 'bg-surface-2 text-muted',
  syncing: 'bg-primary/12 text-primary',
  waiting: 'bg-surface-2 text-muted',
}
const DOT: Record<Status, string> = { ok: 'bg-up', error: 'bg-down', paused: 'bg-muted', syncing: 'bg-primary', waiting: 'bg-muted' }

function ConnectionTile({
  conn,
  pro,
  paused,
  plan,
  now,
  onSynced,
  onError,
}: {
  conn: Connection
  pro: boolean
  /** не по тарифу — синхронизация не идёт («нужен Pro Plus»), подключение не удаляется */
  paused: boolean
  plan: Plan | undefined
  now: number
  onSynced: (r: SyncResult) => void
  onError: (text: string) => void
}) {
  const t = useT()
  const c = t.connections
  const sync = useSyncConnection()
  const del = useDeleteConnection()
  const syncing = useSyncing(conn.id) || sync.isPending
  const [confirming, setConfirming] = useState(false)
  const code = errorCodeOf(conn.last_error)
  const errText = code ? ((c.errors as Record<string, string>)[code] ?? c.errors.UNKNOWN) : null
  // что ответила биржа (после « | ») — мелко под подсказкой
  const errDetail = conn.last_error?.split(' | ').slice(1).join(' | ').trim() || null
  const status: Status = syncing ? 'syncing' : paused ? 'paused' : errText ? 'error' : conn.last_sync_at ? 'ok' : 'waiting'
  const name = exchangeName(conn.exchange, t.exchange.other)
  // ключ Bybit без привязки к IP живёт 90 дней — предупреждаем за 14
  const expiresMs = conn.key_expires_at ? Date.parse(conn.key_expires_at) : null
  const expiry =
    expiresMs === null
      ? null
      : expiresMs < now
        ? { tone: 'text-loss', text: c.keyExpired }
        : expiresMs - now < 14 * DAY_MS
          ? { tone: 'text-warning', text: fmt(c.keyExpiresSoon, { date: dateOnly().format(new Date(expiresMs)) }) }
          : null
  const synced = conn.last_sync_at ? Date.parse(conn.last_sync_at) : null
  const ago = synced === null ? null : now - synced
  const next = synced === null ? null : synced + SERVER_EVERY_MS - now

  return (
    <li data-conn={conn.exchange} data-status={status} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold">{name}</div>
          <div className="num truncate text-xs text-muted">{conn.label ?? shortKey(conn.api_key)}</div>
        </div>
        <span data-pill className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${PILL[status]}`}>
          <span className={`size-1.5 rounded-full ${DOT[status]}`} aria-hidden />
          {c.status[status]}
        </span>
      </div>

      {status === 'error' && (
        <div className="rounded-lg bg-down/8 px-3 py-2 text-sm">
          <p className="text-loss">{errText}</p>
          {errDetail && <p className="num mt-1 text-xs break-words text-muted">{fmt(c.errorDetail, { text: errDetail })}</p>}
        </div>
      )}
      {paused && <UpgradeLine className="!text-xs" text={pausedText(t, conn.exchange, plan)} />}
      {expiry && !errText && <p className={`text-xs ${expiry.tone}`}>{expiry.text}</p>}

      <p className="text-xs text-muted">
        {syncing ? c.status.syncing : ago === null ? c.neverSynced : ago < 60_000 ? c.updatedNow : fmt(c.updatedAgo, { ago: formatDuration(ago) })}
        {/* Pro Plus: сервер подтянет сам — примерно через 3 ч после прошлой синхронизации */}
        {!syncing && pro && status === 'ok' && next !== null && (
          <span> · {next > 60_000 ? fmt(c.nextIn, { in: formatDuration(next) }) : c.nextSoon}</span>
        )}
      </p>

      <div className="mt-auto flex justify-end gap-2">
        <Button variant="ghost" className="!px-3 !py-1.5 text-xs" disabled={del.isPending} onClick={() => setConfirming(true)}>
          {c.remove}
        </Button>
        <Button
          variant="secondary"
          className="!px-3 !py-1.5 text-xs"
          loading={syncing}
          disabled={paused}
          onClick={() => sync.mutate(conn, { onSuccess: onSynced, onError: (e) => onError(connectionError(e, t)) })}
        >
          {c.sync}
        </Button>
      </div>

      <ConfirmDialog
        open={confirming}
        title={fmt(c.removeTitle, { name })}
        confirm={c.remove}
        cancel={t.common.cancel}
        loading={del.isPending}
        onClose={() => setConfirming(false)}
        onConfirm={() =>
          del.mutate(conn.id, {
            onSuccess: () => setConfirming(false),
            onError: (e) => {
              setConfirming(false)
              onError(connectionError(e, t))
            },
          })
        }
      >
        {c.removeConfirm}
      </ConfirmDialog>
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
  const [passphrase, setPassphrase] = useState('')
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [demo, setDemo] = useState(false)
  // №15: «Подключить» — крутилка в круге (идёт проверка ключа), галочка цветом прибыли
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const kind = CONNECTABLE.find((x) => x.id === exchange)!.kind
  const needsPassphrase = NEEDS_PASSPHRASE.has(exchange)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSaveState('busy')
    try {
      const id = await add.mutateAsync({
        exchange,
        apiKey,
        secret: kind === 'cex' ? secret : undefined,
        passphrase: needsPassphrase ? passphrase : undefined,
        label,
      })
      setSecret('')
      setPassphrase('')
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
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
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
              {needsPassphrase && (
                <PasswordInput
                  label={c.passphrase}
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  autoComplete="new-password"
                  required
                  hint={c.passphraseHint}
                />
              )}
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
