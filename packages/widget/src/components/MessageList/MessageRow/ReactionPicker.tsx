import { useRef } from 'react'
import type { ReactionSummary } from '../../../domain/reactions'
import { t } from '../../../i18n'
import { cn } from '../../../shared/utils/cn'
import { QUICK_REACTIONS } from './quickReactions'
import styles from './ReactionPicker.module.css'

interface Props {
  summaries: ReactionSummary[]
  onToggle: (key: string) => void
}

export function ReactionPicker({ summaries, onToggle }: Props) {
  const listRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLElement>('button') ?? [])
    if (buttons.length === 0) return

    const current = buttons.indexOf(document.activeElement as HTMLElement)

    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault()
        buttons[(current + 1) % buttons.length]?.focus()
        break
      case 'ArrowLeft':
        event.preventDefault()
        buttons[(current - 1 + buttons.length) % buttons.length]?.focus()
        break
      case 'Home':
        event.preventDefault()
        buttons[0]?.focus()
        break
      case 'End':
        event.preventDefault()
        buttons[buttons.length - 1]?.focus()
        break
    }
  }

  return (
    <div
      ref={listRef}
      role="toolbar"
      aria-label={t('chat.reaction.pick')}
      className={styles.picker}
      onKeyDown={handleKeyDown}
    >
      {QUICK_REACTIONS.map((key) => {
        const isOwn = summaries.some((s) => s.key === key && s.ownEventId !== null)

        return (
          <button
            key={key}
            type="button"
            className={cn(styles.item, isOwn && styles.own)}
            aria-pressed={isOwn}
            aria-label={t(isOwn ? 'chat.reaction.remove' : 'chat.reaction.add', { emoji: key })}
            onClick={() => onToggle(key)}
          >
            {key}
          </button>
        )
      })}
    </div>
  )
}
