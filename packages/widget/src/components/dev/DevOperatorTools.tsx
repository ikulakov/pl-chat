import { useState } from 'react'
import { isSystem } from '../../domain/timeline'
import { useChatStore } from '../../hooks/useChatStore'
import { t } from '../../i18n'
import { chatStore } from '../../store/store'
import styles from './DevOperatorTools.module.css'

// Фолбэк, пока в комнате ещё нет ни одного операторского сообщения
const DEV_OPERATOR_FALLBACK_ID = '@operator:bank'

export function DevOperatorTools() {
  const [text, setText] = useState('')
  const [isNotice, setIsNotice] = useState(false)
  const userId = useChatStore((s) => s.userId)

  const send = () => {
    const body = text.trim()
    if (!body) return

    if (isNotice) {
      const id = crypto.randomUUID()
      chatStore.getState().dispatch({
        type: 'message.optimisticAdded',
        message: { kind: 'notice', localId: id, eventId: id, ts: Date.now(), content: { body } },
      })
      setText('')
      return
    }

    const lastOperatorMessage = chatStore
      .getState()
      .room.timeline.findLast((m) => !isSystem(m) && m.sender !== userId)

    const operatorId =
      lastOperatorMessage && !isSystem(lastOperatorMessage)
        ? lastOperatorMessage.sender
        : DEV_OPERATOR_FALLBACK_ID

    chatStore.getState().dispatch({
      type: 'message.optimisticAdded',
      message: {
        kind: 'text',
        localId: crypto.randomUUID(),
        eventId: crypto.randomUUID(),
        sender: userId === operatorId ? '@dev-guest:bank' : operatorId,
        ts: Date.now(),
        sendStatus: 'sent',
        content: { body },
      },
    })
    setText('')
  }

  return (
    <div className={styles.wrap}>
      <label className={styles.noticeToggle}>
        <input
          type="checkbox"
          checked={isNotice}
          onChange={(e) => setIsNotice(e.target.checked)}
        />
        {t('dev.operatorMessageNotice')}
      </label>
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
