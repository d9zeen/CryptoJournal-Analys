/**
 * №15 Кнопка сохранения: нажатие — сжимается в круг с крутилкой; успех — раскрывается цветом прибыли, рисуется галочка
 * (контент — тёмный --color-on-profit, контраст ≥ 4.5:1 в обеих темах), через ~600 мс — дальше (onDone у вызывающего);
 * ошибка — возврат к обычному виду (ошибку показывает форма, как во входе №4).
 * Ширина анимируется только у этой одной кнопки (не в списках).
 */
import { useLayoutEffect, useRef, useState, type ButtonHTMLAttributes } from 'react'
import { useT } from '@/i18n'
import { CheckMark } from './CheckMark'

export type SaveState = 'idle' | 'busy' | 'done'

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & { state: SaveState; type?: 'submit' | 'button' }

export function SaveButton({ state, children, className = '', disabled, type = 'submit', ...rest }: Props) {
  const t = useT()
  const ref = useRef<HTMLButtonElement>(null)
  // ширина обычной кнопки — запоминаем, чтобы плавно сжиматься в круг и раскрываться обратно
  const [w, setW] = useState<number | null>(null)
  useLayoutEffect(() => {
    if (state === 'idle' && ref.current) setW(ref.current.offsetWidth)
  }, [state, children])
  const width = state === 'busy' ? 44 : (w ?? undefined)
  return (
    <button
      ref={ref}
      type={type}
      {...rest}
      disabled={disabled || state !== 'idle'}
      aria-busy={state === 'busy' || undefined}
      data-state={state}
      style={state === 'idle' ? undefined : { width, minWidth: 0 }}
      className={`relative inline-flex h-11 items-center justify-center overflow-hidden px-4 text-sm font-semibold whitespace-nowrap transition-[width,border-radius,background-color,transform] duration-[350ms] ease-[var(--ease-snap)] active:scale-[0.97] disabled:cursor-not-allowed ${
        state === 'busy' ? 'rounded-full px-0' : 'rounded-lg'
      } ${state === 'done' ? 'bg-profit text-on-profit' : 'bg-primary text-on-primary hover:bg-primary-hover'} ${state === 'idle' && disabled ? 'opacity-60' : ''} ${className}`}
    >
      <span className={`inline-flex items-center gap-2 transition-[opacity,transform] duration-200 ${state === 'idle' ? '' : 'scale-90 opacity-0'}`}>
        {children}
      </span>
      {state === 'busy' && (
        <span className="absolute inset-0 grid place-items-center">
          <span className="size-[18px] animate-spin rounded-full border-[2.5px] border-current border-t-transparent" />
        </span>
      )}
      {state === 'done' && (
        <span className="absolute inset-0 grid place-items-center">
          <CheckMark className="size-6" />
          <span className="sr-only">{t.common.done}</span>
        </span>
      )}
    </button>
  )
}
