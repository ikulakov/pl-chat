import { useEffect, useRef } from 'react'
import { useScrollClass } from '../hooks/useScrollClass'
import { cn } from '../shared/cn'
import { formatTime } from '../shared/formatTime'
import { useChatStore } from '../hooks/useChatStore'
import { MessageBubble } from './MessageBubble'
import styles from './MessageList.module.css'

export function MessageList() {
  const messages = useChatStore((s) => s.messages)
  const userId = useChatStore((s) => s.userId)

  const bottomRef = useRef<HTMLDivElement>(null)
  const handleScroll = useScrollClass(styles.scrolling!)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'instant' })
  }, [messages])

  return (
    <div className={styles.wrap}>
      <div
        className={cn(styles.list)}
        onScroll={handleScroll}
      >
        {messages.map((msg) => (
          <div
            key={msg.localId}
            className={cn(styles.group, msg.sender === userId ? styles.groupUser : undefined)}
          >
            <MessageBubble
              type={msg.sender === userId ? 'user' : 'operator'}
              position="single"
              time={formatTime(msg.ts)}
              status={msg.pending ? 'sending' : msg.failed ? 'failed' : 'sent'}
            >
              {msg.body}
            </MessageBubble>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
