import { useMemo, useRef } from 'react'
import { readOwnEventIds } from '../../domain/receipts'
import { isSystem } from '../../domain/timeline'
import { useChatScroll } from '../../hooks/useChatScroll'
import { useChatStore } from '../../hooks/useChatStore'
import { useLoadMoreHistory } from '../../hooks/useLoadMoreHistory'
import { useSendReadReceipts } from '../../hooks/useSendReadReceipts'
import { cn } from '../../shared/cn'
import { Spinner } from '../../shared/ui/Spinner'
import { selectIsOpen, selectReadReceipts, selectTimeline } from '../../store/selectors'
import { getPosition, groupTimelineByDate } from './MessageList.helpers'
import styles from './MessageList.module.css'
import { MessageRow } from './MessageRow'
import { ScrollToBottomButton } from './ScrollToBottomButton'
import { SystemMessage } from './SystemMessage'

interface Props {
  userId: string
}

export function MessageList({ userId }: Props) {
  const isOpen = useChatStore(selectIsOpen)
  const readReceipts = useChatStore(selectReadReceipts)

  const timeline = useChatStore(selectTimeline)
  const timelineGroupedByDate = useMemo(() => groupTimelineByDate(timeline), [timeline])

  // eventId сообщений, которые уже прочитал оператор
  const readByOperatorIds = useMemo(
    () => readOwnEventIds(readReceipts, timeline, userId),
    [readReceipts, timeline, userId],
  )

  const messagesListRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const { isNearBottom, scrollToBottom } = useChatScroll({
    timeline,
    userId,
    containerRef: messagesListRef,
    bottomRef,
  })

  const { showHistorySpinner } = useLoadMoreHistory({
    timeline,
    containerRef: messagesListRef,
  })

  useSendReadReceipts({ timeline, isOpen, containerRef: messagesListRef })

  return (
    <div className={styles.wrap}>
      <div
        ref={messagesListRef}
        className={cn(styles.list, showHistorySpinner && styles.datesBelowSpinner)}
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
                return (
                  <SystemMessage
                    key={item.localId}
                    itemId={item.localId}
                  >
                    {item.content.body}
                  </SystemMessage>
                )
              }
              const position = getPosition(arr[index - 1], item, arr[index + 1])
              return (
                <MessageRow
                  key={item.localId}
                  userId={userId}
                  message={item}
                  position={position}
                  readByOperator={readByOperatorIds.has(item.eventId)}
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

      {showHistorySpinner && (
        <div className={styles.historySpinnerWrap}>
          <Spinner size="inline" />
        </div>
      )}
      {!isNearBottom && <ScrollToBottomButton onClick={scrollToBottom} />}
    </div>
  )
}
