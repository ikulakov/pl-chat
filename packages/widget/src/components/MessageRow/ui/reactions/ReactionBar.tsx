import type { ReactionSummary } from '@/domain/reactions'
import { t } from '@/i18n'
import styles from './ReactionBar.module.css'

interface Props {
  summaries: ReactionSummary[]
  onToggle: (key: string) => void
}

export function ReactionBar({ summaries, onToggle }: Props) {
  return (
    <div
      className={styles.bar}
      data-testid="reaction-bar"
    >
      {summaries.map(({ key, count, isOwn }) => (
        <button
          key={key}
          type="button"
          className={styles.chip}
          aria-pressed={isOwn}
          aria-label={t('chat.reaction.count', { emoji: key, count })}
          onClick={() => onToggle(key)}
        >
          <span
            className={styles.emoji}
            aria-hidden="true"
          >
            {key}
          </span>
          {/* один участник — счётчик не несёт информации, в макете его нет */}
          {count > 1 ? (
            <span
              className={styles.count}
              aria-hidden="true"
            >
              {count}
            </span>
          ) : undefined}
        </button>
      ))}
    </div>
  )
}
