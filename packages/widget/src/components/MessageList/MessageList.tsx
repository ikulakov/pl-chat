import { useMemo, useRef } from 'react'
import { isSystem } from '../../domain/timeline'
import { useChatScroll } from '../../hooks/useChatScroll'
import { useChatStore } from '../../hooks/useChatStore'
import { t } from '../../i18n'
import { IconButton } from '../../shared/ui/IconButton'
import { ChevronDownIcon } from '../../shared/ui/icons'
import { getPosition, groupTimelineByDate } from './MessageList.helpers'
import styles from './MessageList.module.css'
import { MessageRow } from './MessageRow'
import { SystemMessage } from './SystemMessage'

export function MessageList() {
  const userId = useChatStore((s) => s.userId)
  const timeline = useChatStore((s) => s.timeline)
  const timelineGroupedByDate = useMemo(() => groupTimelineByDate(timeline), [timeline])

  const messagesListRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const { showScrollButton, scrollToBottom } = useChatScroll({
    timeline,
    userId,
    containerRef: messagesListRef,
    bottomRef,
  })

  return (
    <div className={styles.wrap}>
      <div
        ref={messagesListRef}
        className={styles.list}
      >
        {timelineGroupedByDate.map(({ key, label, items }) => (
          <div
            key={key}
            className={styles.dayGroup}
          >
            <div
              className={styles.dateSeparator}
              data-date-label={label}
            >
              <span className={styles.dateSeparatorLabel}>{label}</span>
            </div>

            {items.map((item, index, arr) => {
              if (isSystem(item)) {
                return <SystemMessage key={item.localId}>{item.content.body}</SystemMessage>
              }
              const position = getPosition(arr[index - 1], item, arr[index + 1])
              return (
                <MessageRow
                  key={item.localId}
                  userId={userId}
                  message={item}
                  position={position}
                />
              )
            })}
          </div>
        ))}
        <div
          ref={bottomRef}
          className={styles.bottomSentinel}
        />
      </div>

      {showScrollButton && (
        <IconButton
          variant="floating"
          size="md"
          className={styles.scrollButton}
          aria-label={t('chat.scroll-down')}
          onClick={scrollToBottom}
        >
          <ChevronDownIcon />
        </IconButton>
      )}
    </div>
  )
}
