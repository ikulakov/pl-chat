import { useState } from 'react'
import { useChatStore } from '../hooks/useChatStore'
import { t } from '../i18n'
import { chatStore } from '../store/store'
import styles from './DevOperatorTools.module.css'

const DEV_OPERATOR_ID = '@operator:bank'

export function DevOperatorTools() {
  const [text, setText] = useState('')
  const userId = useChatStore((s) => s.userId)

  const send = () => {
    const body = text.trim()
    if (!body) return

    chatStore.getState().dispatch({
      type: 'message.optimisticAdded',
      message: {
        localId: crypto.randomUUID(),
        eventId: crypto.randomUUID(),
        sender: userId === DEV_OPERATOR_ID ? '@dev-guest:bank' : DEV_OPERATOR_ID,
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
