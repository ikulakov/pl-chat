import { useScrollClass } from '../hooks/useScrollClass'
import { cn } from '../shared/cn'
import styles from './ChatPanel.module.css'
import { Header } from './Header'
import { MessageBubble } from './MessageBubble'
import { MessageInput } from './MessageInput'
import { QuickReplies } from './QuickReplies'

const QUICK_REPLY_ROWS = [
  ['Баланс и лимиты', 'Заявка на карту'],
  ['Комиссия', 'Снятие валюты'],
  ['Инвестиции', 'Условия по вкладам'],
]

export function ChatPanel() {
  const handleScroll = useScrollClass(styles.scrolling!)

  return (
    <div className={styles.panel}>
      <Header
        name="Помощник ОТП"
        subtitle="Виртуальный ассистент онлайн"
      />

      <div className={styles.messagesWrap}>
        <div
          className={styles.messages}
          onScroll={handleScroll}
        >
          <div className={styles.dateSep}>
            <span className={styles.dateSepLabel}>15 июня</span>
          </div>

          <div className={styles.group}>
            <MessageBubble
              type="bot"
              position="single"
              time="11:40"
            >
              {
                'Здравствуйте!\nЯ виртуальный помощник ОТП. Помогу с типовыми\nвопросами - выберите тему или напишите свой вопрос'
              }
            </MessageBubble>
            <QuickReplies
              rows={QUICK_REPLY_ROWS}
              lastRow="Связаться с оператором"
            />
          </div>

          {/* Сообщение пользователя */}
          <div className={cn(styles.group, styles.groupUser)}>
            <MessageBubble
              type="user"
              position="single"
              time="11:40"
              status="read"
            >
              Условия по вкладам
            </MessageBubble>
          </div>
        </div>
      </div>
      <MessageInput />
    </div>
  )
}
