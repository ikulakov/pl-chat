import type { ReactionSummary } from '../../../domain/reactions'
import { t } from '../../../i18n'
import { cn } from '../../../shared/utils/cn'
import styles from './ReactionBar.module.css'

interface Props {
  summaries: ReactionSummary[]
  onToggle: (key: string) => void
}

export function ReactionBar({ summaries, onToggle }: Props) {
  return (
    <div className={styles.bar}>
      {summaries.map(({ key, count, ownEventId }) => (
        <button
          key={key}
          type="button"
          className={cn(styles.chip, ownEventId !== null && styles.own)}
          aria-pressed={ownEventId !== null}
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
