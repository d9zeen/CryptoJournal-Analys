/** Текст с выделенными ключевыми словами: в ru.ts они в **звёздочках** → жирным и основным цветом текста */
import { Fragment } from 'react'

export function Rich({ text }: { text: string }) {
  return text.split('**').map((part, i) =>
    i % 2 ? (
      <strong key={i} className="font-semibold text-text">
        {part}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  )
}

/** Тот же текст без звёздочек — для aria-label и подсказок */
export const plain = (text: string) => text.replaceAll('**', '')
