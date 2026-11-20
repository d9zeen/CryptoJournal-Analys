/**
 * «Подключённые биржи» на странице «Биржи» (владелец 19.11.2026: «1 убрать и поменять на 2» — вместо «Сделки собирают кривую»
 * тот же блок, что без подключений, — «Орбита»):
 *  - слева «Орбита»: все биржи обычные, подключённые биржи и кошельки чуть подсвечены;
 *  - справа — «Подключено: Bybit, OKX…», как приходят сделки (сервер каждые 3 ч на Pro Plus / пока сайт открыт) и «Подключить ещё».
 * Блок по центру, орбита крупнее (владелец 20.11.2026: «ближе к центру… чуть-чуть больше»).
 * Списка подключений справа нет (владелец 20.11.2026: «вот это отсюда убрать») — биржа открывается карточкой в сетке ниже,
 * проблемы с ключом — строками под блоком (ConnectionsCard).
 */
import { useMemo } from 'react'
import { fmt, useT } from '@/i18n'
import { exchangeName } from '@/lib/exchanges'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { Button } from '@/components/ui/Button'
import { Orbit } from '@/components/fx/Orbit'
import type { Connection } from './api'

export function LinkedOrbit({ conns, pro, onAdd }: { conns: Connection[]; pro: boolean; onAdd: () => void }) {
  const t = useT()
  const c = t.connections
  const wide = useMediaQuery('(min-width: 1280px)')
  const mid = useMediaQuery('(min-width: 768px)')
  // одна биржа двумя ключами — одна; в порядке подключения
  const ids = useMemo(() => [...new Set(conns.map((cn) => cn.exchange))], [conns])
  const lit = useMemo(() => new Set(ids), [ids])
  const names = ids.slice(0, 3).map((ex) => exchangeName(ex, ex)).join(', ') + (ids.length > 3 ? ` ${fmt(c.linked.more, { n: ids.length - 3 })}` : '')

  return (
    <div
      data-linked-orbit
      className="grid items-center justify-items-center gap-6 rounded-xl border border-border bg-surface px-4 py-6 sm:px-8 md:grid-cols-[auto_minmax(0,32rem)] md:justify-center md:justify-items-start md:gap-10 xl:gap-16 xl:py-8"
    >
      <Orbit size={wide ? 380 : mid ? 320 : 250} lit={lit} />
      <div className="flex max-w-xl flex-col items-center gap-3 text-center md:items-start md:text-left">
        <p className="font-display text-xl font-semibold xl:text-2xl">{fmt(c.linked.title, { names })}</p>
        <p className="text-sm text-muted xl:text-base">{pro ? c.linked.textPro : c.linked.textFree}</p>
        <Button variant="secondary" className="mt-1" onClick={onAdd}>
          {c.linked.cta}
        </Button>
      </div>
    </div>
  )
}
