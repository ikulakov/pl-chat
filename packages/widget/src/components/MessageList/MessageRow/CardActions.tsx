import type { CardAction, CardAnswer } from '../../../domain/adaptiveCards'
import { t } from '../../../i18n'
import { cn } from '../../../shared/utils/cn'
import styles from './CardActions.module.css'

interface Props {
  actions: CardAction[]
  answer: CardAnswer | undefined
  onSelect: (action: CardAction) => void
}

export function CardActions({ actions, answer, onSelect }: Props) {
  const disabled = answer?.status === 'sending' || answer?.status === 'sent'

  return (
    <div
      className={styles.wrap}
      data-role="card-actions"
    >
      {actions.map((action) => {
        const isChosen = answer?.actionId === action.id

        return (
          <button
            key={action.id}
            type="button"
            className={cn(styles.chip, isChosen && answer?.status === 'sent' && styles.chosen)}
            disabled={disabled}
            onClick={() => onSelect(action)}
          >
            {action.title}
          </button>
        )
      })}

      {answer?.status === 'failed' && (
        <span
          className={cn(styles.footer, styles.error)}
          role="alert"
        >
          {t('chat.adaptiveCard.submitError')}
        </span>
      )}
    </div>
  )
}
