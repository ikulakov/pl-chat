import type { ReactionSummary } from '@/domain/reactions'
import { t } from '@/i18n'
import { useState, type KeyboardEvent } from 'react'
import styles from './ReactionPicker.module.css'

interface Props {
  summaries: ReactionSummary[]
  onToggle: (key: string) => void
}

/**
 * Полный пикер эмодзи (кнопка «⌄» в макете) приедет отдельной задачей — до тех пор седьмого
 * слота нет: кнопка без обработчика хуже её отсутствия.
 */
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

export function ReactionPicker({ summaries, onToggle }: Props) {
  const [focusedIndex, setFocusedIndex] = useState(0)

  // Своя реакция на сообщение одна: выбор другой заменяет её (MatrixReactions). Своих бывает и
  // несколько — их оставляет вторая вкладка; нажатая любая из них снимает все, так и помечаем.
  const ownKeys = new Set(summaries.filter((s) => s.isOwn).map((s) => s.key))

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const count = QUICK_REACTIONS.length
    const nextIndexByKey: Partial<Record<string, number>> = {
      ArrowRight: (focusedIndex + 1) % count,
      ArrowLeft: (focusedIndex - 1 + count) % count,
      Home: 0,
      End: count - 1,
    }
    const nextIndex = nextIndexByKey[event.key]
    if (nextIndex === undefined) return

    event.preventDefault()
    event.currentTarget.querySelectorAll<HTMLButtonElement>('button')[nextIndex]?.focus()
  }

  return (
    <div
      data-testid="reaction-picker"
      role="toolbar"
      aria-label={t('chat.reaction.pick')}
      className={styles.picker}
      onKeyDown={handleKeyDown}
    >
      {QUICK_REACTIONS.map((key, index) => (
        <button
          key={key}
          data-testid={`reaction-picker-${key}`}
          type="button"
          className={styles.item}
          aria-pressed={ownKeys.has(key)}
          aria-label={t(ownKeys.has(key) ? 'chat.reaction.remove' : 'chat.reaction.add', {
            emoji: key,
          })}
          tabIndex={index === focusedIndex ? 0 : -1}
          onFocus={() => setFocusedIndex(index)}
          onClick={() => onToggle(key)}
        >
          {key}
        </button>
      ))}
    </div>
  )
}
