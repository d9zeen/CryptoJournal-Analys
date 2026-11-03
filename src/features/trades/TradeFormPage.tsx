import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { fmt, useT } from '@/i18n'
import { useDeleteTrade, useSaveTrade, useTrade } from './api'
import { buildTrade, computeDerived, emptyForm, formFromTrade, type FormErrors, type FormState } from './formLogic'
import { ListSelect } from './ListSelect'
import { MistakePicker } from './MistakePicker'
import { ScreenshotsField } from './ScreenshotsField'
import type { TradeScreenshot } from '@/types/db'
import { useUsage } from '@/features/settings/api'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { Segmented } from '@/components/ui/Segmented'
import { Checkbox } from '@/components/ui/Checkbox'
import { NumberField, SelectField, TextArea, TextField } from '@/components/ui/Field'
import { EXCHANGES } from '@/lib/exchanges'
import { isStopOnWrongSide, marginUsd, qtyCoins } from '@/lib/calc/trade'
import { formatNumber, formatPnl, formatR, formatUsd, isoToLocalInput, pnlClass } from '@/lib/format'
import { dbErrorMessage } from '@/lib/errors'
import type { MarketType, Side } from '@/lib/calc/trade'

const LAST_KEY = 'cj:lastTradeDefaults'

function loadDefaults(): Partial<FormState> {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) ?? '{}')
  } catch {
    return {}
  }
}
function saveDefaults(f: FormState) {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify({ exchange: f.exchange, marketType: f.marketType, leverage: f.leverage }))
  } catch {
    /* приватный режим — не страшно */
  }
}

export function TradeFormPage() {
  const { id } = useParams()
  const isNew = !id
  const t = useT()
  const { data: existing, isLoading } = useTrade(id)

  if (!isNew && isLoading) return <p className="text-muted">{t.common.loading}</p>
  if (!isNew && !existing) {
    return (
      <Card>
        <p className="text-muted">{t.tradeForm.notFound}</p>
        <Link to="/trades" className="mt-3 inline-block text-primary hover:underline">
          ← {t.trades.title}
        </Link>
      </Card>
    )
  }
  return <TradeForm key={id ?? 'new'} existing={existing ?? null} />
}

function TradeForm({ existing }: { existing: ReturnType<typeof useTrade>['data'] }) {
  const t = useT()
  const navigate = useNavigate()
  const isNew = !existing
  const [tradeId] = useState(() => existing?.id ?? crypto.randomUUID())
  const [form, setForm] = useState<FormState>(() => (existing ? formFromTrade(existing) : emptyForm(loadDefaults())))
  const [errors, setErrors] = useState<FormErrors>({})
  const [addShots, setAddShots] = useState<Blob[]>([])
  const [removeShots, setRemoveShots] = useState<TradeScreenshot[]>([])
  const allSaved = useMemo(
    () => [...(existing?.trade_screenshots ?? [])].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)),
    [existing],
  )
  const savedShots = allSaved.filter((s) => !removeShots.some((r) => r.id === s.id))
  const [submitError, setSubmitError] = useState<string | null>(null)

  const save = useSaveTrade()
  const del = useDeleteTrade()
  const { data: usage } = useUsage()
  const limitReached = isNew && usage?.trade_limit != null && usage.trades_created >= usage.trade_limit

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
    setSubmitError(null)
  }

  // спот — только long без плеча
  useEffect(() => {
    if (form.marketType === 'spot') setForm((f) => ({ ...f, side: 'long', leverage: '1' }))
  }, [form.marketType])

  const d = useMemo(() => computeDerived(form), [form])
  const lev = Number(form.leverage.replace(',', '.')) || 1
  const margin = d.sizeUsd ? marginUsd(d.sizeUsd, lev) : null
  const qty = d.sizeUsd && d.entryPrice && form.marketType !== 'inverse' ? qtyCoins(d.sizeUsd, d.entryPrice) : null
  const stopWrong = d.entryPrice ? isStopOnWrongSide(form.side, d.entryPrice, d.stopLoss) : false
  const err = (k: keyof FormState) => (errors[k] ? t.tradeForm.errors[errors[k]!] : undefined)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    const { trade, errors } = buildTrade(form, { id: tradeId, screenshot_path: null }) // старое одиночное поле: файлы уже в trade_screenshots (миграция 0003)
    setErrors(errors)
    if (!trade) {
      setSubmitError(t.tradeForm.errors.form)
      return
    }
    // поле времени точно до минуты: если время не трогали — сохраняем исходное (с секундами)
    if (existing) {
      if (form.entryAt === isoToLocalInput(existing.entry_at)) trade.entry_at = existing.entry_at
      if (existing.exit_at && trade.exit_at && form.exitAt === isoToLocalInput(existing.exit_at)) trade.exit_at = existing.exit_at
    }
    try {
      const nextOrder = allSaved.reduce((m, s) => Math.max(m, s.sort_order + 1), 0)
      await save.mutateAsync({ trade, tagIds: form.tagIds, isNew, screenshots: { add: addShots, remove: removeShots, nextOrder } })
      if (isNew) saveDefaults(form)
      navigate('/trades')
    } catch (error) {
      setSubmitError(dbErrorMessage(error, t))
    }
  }

  async function onDelete() {
    if (!existing || !window.confirm(t.tradeForm.deleteConfirm)) return
    try {
      await del.mutateAsync(existing)
      navigate('/trades', { replace: true })
    } catch (error) {
      setSubmitError(dbErrorMessage(error, t))
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/trades" className="text-muted hover:text-text" aria-label={t.common.back}>
            ←
          </Link>
          <h1 className="text-xl font-semibold">{isNew ? t.tradeForm.titleNew : `${t.tradeForm.titleEdit} ${existing!.symbol}`}</h1>
        </div>
        {!isNew && (
          <Button type="button" variant="ghost" onClick={onDelete} loading={del.isPending} className="text-loss hover:text-loss">
            {t.common.delete}
          </Button>
        )}
      </div>

      {limitReached && <Alert tone="error">{fmt(t.tradeForm.limitBanner, { used: usage!.trades_created, limit: usage!.trade_limit! })}</Alert>}

      <Section title={t.tradeForm.sections.main}>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label={t.tradeForm.exchange} value={form.exchange} onChange={(e) => set('exchange', e.target.value)}>
            {EXCHANGES.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.name ?? t.exchange.other}
              </option>
            ))}
          </SelectField>
          <SelectField label={t.tradeForm.market} value={form.marketType} onChange={(e) => set('marketType', e.target.value as MarketType)}>
            <option value="linear">{t.market.linear}</option>
            <option value="inverse">{t.market.inverse}</option>
            <option value="spot">{t.market.spot}</option>
          </SelectField>
          <TextField
            label={t.tradeForm.symbol}
            placeholder={t.tradeForm.symbolPlaceholder}
            value={form.symbol}
            onChange={(e) => set('symbol', e.target.value.toUpperCase())}
            autoCapitalize="characters"
            autoComplete="off"
            error={err('symbol')}
          />
          <div className="flex flex-col gap-1.5">
            <Segmented<Side>
              label={t.tradeForm.side}
              value={form.side}
              disabled={form.marketType === 'spot'}
              onChange={(v) => set('side', v)}
              options={[
                { value: 'long', label: t.side.long, tone: 'profit' },
                { value: 'short', label: t.side.short, tone: 'loss' },
              ]}
            />
            {form.marketType === 'spot' && <p className="text-xs text-muted">{t.tradeForm.spotLongOnly}</p>}
          </div>
        </div>
      </Section>

      <Section title={t.tradeForm.sections.entryExit}>
        <Checkbox label={t.tradeForm.isClosed} checked={form.isClosed} onChange={(e) => set('isClosed', e.target.checked)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField type="datetime-local" label={t.tradeForm.entryAt} value={form.entryAt} onChange={(e) => set('entryAt', e.target.value)} error={err('entryAt')} />
          <NumberField label={t.tradeForm.entryPrice} value={form.entryPrice} onChange={(e) => set('entryPrice', e.target.value)} error={err('entryPrice')} />
          {form.isClosed && (
            <>
              <TextField type="datetime-local" label={t.tradeForm.exitAt} value={form.exitAt} onChange={(e) => set('exitAt', e.target.value)} error={err('exitAt')} />
              <NumberField label={t.tradeForm.exitPrice} value={form.exitPrice} onChange={(e) => set('exitPrice', e.target.value)} error={err('exitPrice')} />
            </>
          )}
        </div>
        <p className="text-xs text-muted">{t.tradeForm.avgHint}</p>
      </Section>

      <Section title={t.tradeForm.sections.sizeRisk}>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label={t.tradeForm.sizeUsd}
            value={form.sizeUsd}
            onChange={(e) => set('sizeUsd', e.target.value)}
            error={err('sizeUsd')}
            hint={
              margin !== null
                ? qty !== null
                  ? fmt(t.tradeForm.sizeHintCoins, { margin: formatUsd(margin), qty: formatNumber(qty, 6) })
                  : fmt(t.tradeForm.sizeHint, { margin: formatUsd(margin) })
                : undefined
            }
          />
          <NumberField label={t.tradeForm.leverage} value={form.leverage} disabled={form.marketType === 'spot'} onChange={(e) => set('leverage', e.target.value)} error={err('leverage')} />
          <NumberField
            label={t.tradeForm.stopLoss}
            value={form.stopLoss}
            onChange={(e) => set('stopLoss', e.target.value)}
            error={err('stopLoss')}
            hint={
              stopWrong ? (
                <span className="text-warning">{t.tradeForm.stopWrongSide}</span>
              ) : d.risk !== null ? (
                fmt(t.tradeForm.risk, { risk: formatUsd(d.risk) })
              ) : undefined
            }
          />
          <NumberField label={t.tradeForm.takeProfit} value={form.takeProfit} onChange={(e) => set('takeProfit', e.target.value)} error={err('takeProfit')} />
          <NumberField label={t.tradeForm.fee} placeholder="0" value={form.fee} onChange={(e) => set('fee', e.target.value)} error={err('fee')} />
          <NumberField label={t.tradeForm.funding} placeholder="0" hint={t.tradeForm.fundingHint} value={form.funding} onChange={(e) => set('funding', e.target.value)} error={err('funding')} />
        </div>
      </Section>

      <Section title={t.tradeForm.sections.result}>
        {!form.isClosed ? (
          <p className="text-sm text-muted">{t.tradeForm.pnlOpen}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <Stat label={t.tradeForm.pnl} value={formatPnl(d.pnl)} className={pnlClass(d.pnl)} hint={!form.pnlManual ? (d.pnlAuto === null ? t.tradeForm.pnlNeedData : t.tradeForm.pnlAuto) : undefined} />
              <Stat label={t.tradeForm.r} value={formatR(d.r)} className={pnlClass(d.r)} hint={d.risk === null ? t.tradeForm.rNoStop : undefined} />
            </div>
            <Checkbox label={t.tradeForm.pnlManual} checked={form.pnlManual} onChange={(e) => set('pnlManual', e.target.checked)} />
            {form.pnlManual && <NumberField label={t.tradeForm.pnlManualLabel} value={form.pnl} onChange={(e) => set('pnl', e.target.value)} error={err('pnl')} wrapClassName="sm:max-w-xs" />}
          </>
        )}
      </Section>

      <Section title={t.tradeForm.sections.review}>
        <div className="grid gap-4 sm:grid-cols-2">
          <ListSelect kind="setups" label={t.tradeForm.setup} value={form.setupId} onChange={(v) => set('setupId', v)} />
          <ListSelect kind="emotions" label={t.tradeForm.emotion} value={form.emotionId} onChange={(v) => set('emotionId', v)} />
        </div>
        <MistakePicker value={form.tagIds} onChange={(v) => set('tagIds', v)} />
        <TextArea label={t.tradeForm.note} placeholder={t.tradeForm.notePlaceholder} maxLength={5000} value={form.note} onChange={(e) => set('note', e.target.value)} />
        <ScreenshotsField
          saved={savedShots}
          pending={addShots}
          onAdd={(blobs) => setAddShots((a) => [...a, ...blobs])}
          onRemoveSaved={(s) => setRemoveShots((r) => [...r, s])}
          onRemovePending={(i) => setAddShots((a) => a.filter((_, j) => j !== i))}
        />
      </Section>

      {submitError && <Alert tone="error">{submitError}</Alert>}

      <div className="sticky bottom-20 z-10 flex gap-3 md:bottom-4">
        <Button type="submit" loading={save.isPending} disabled={limitReached} className="flex-1 shadow-lg sm:flex-none">
          {t.tradeForm.save}
        </Button>
        <Button type="button" variant="secondary" onClick={() => navigate('/trades')} className="shadow-lg">
          {t.common.cancel}
        </Button>
      </div>
    </form>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="font-medium">{title}</h2>
      {children}
    </Card>
  )
}

function Stat({ label, value, className = '', hint }: { label: string; value: string; className?: string; hint?: string }) {
  return (
    <div>
      <div className="text-sm text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${className}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  )
}
