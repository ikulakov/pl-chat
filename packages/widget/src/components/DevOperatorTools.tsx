import { useState } from 'react'
import { useChatStore } from '../hooks/useChatStore'
import { t } from '../i18n'
import { chatStore } from '../store/store'
import styles from './DevOperatorTools.module.css'

// Фолбэк, пока в комнате ещё нет ни одного операторского сообщения
const DEV_OPERATOR_FALLBACK_ID = '@operator:bank'

export function DevOperatorTools() {
  const [text, setText] = useState('')
  const userId = useChatStore((s) => s.userId)

  const send = () => {
    const body = text.trim()
    if (!body) return

    const lastOperatorMessage = chatStore
      .getState()
      .room.messages.findLast((m) => m.sender !== userId)

    const operatorId = lastOperatorMessage?.sender ?? DEV_OPERATOR_FALLBACK_ID

    chatStore.getState().dispatch({
      type: 'message.optimisticAdded',
      message: {
        localId: crypto.randomUUID(),
        eventId: crypto.randomUUID(),
        sender: userId === operatorId ? '@dev-guest:bank' : operatorId,
        body,
        ts: Date.now(),
        pending: false,
        failed: false,
      },
    })
    setText('')
  }

  return (
    <div className={styles.wrap}>
      <input
        className={styles.input}
        value={text}
        placeholder={t('dev.operatorMessagePlaceholder')}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') send()
        }}
      />
      <button
        type="button"
        className={styles.sendBtn}
        onClick={send}
      >
        {t('dev.operatorMessageSend')}
      </button>
    </div>
  )
}
