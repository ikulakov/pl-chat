import { useMemo, useRef } from 'react'
import { useChatScroll } from '../../hooks/useChatScroll'
import { useChatStore } from '../../hooks/useChatStore'
import { t } from '../../i18n'
import { formatTime } from '../../shared/formatTime'
import { IconButton } from '../../shared/ui/IconButton'
import { ChevronDownIcon } from '../icons'
import { MessageBubble } from './MessageBubble'
import { getPosition, groupMessagesByDate } from './MessageList.helpers'
import styles from './MessageList.module.css'

export function MessageList() {
  const userId = useChatStore((s) => s.userId)
  const messages = useChatStore((s) => s.messages)
  const messagesGroupedByDate = useMemo(() => groupMessagesByDate(messages), [messages])

  const messagesListRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const { showScrollButton, scrollToBottom } = useChatScroll({
    messages,
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
        {messagesGroupedByDate.map(({ key, label, messages }) => (
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
            {messages.map((message, index, arr) => {
              const position = getPosition(arr[index - 1], message, arr[index + 1])
              return (
                <MessageBubble
                  key={message.localId}
                  type={message.sender === userId ? 'user' : 'operator'}
                  position={position}
                  time={formatTime(message.ts)}
                  status={message.pending ? 'sending' : message.failed ? 'failed' : 'sent'}
                >
                  {message.body}
                </MessageBubble>
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
