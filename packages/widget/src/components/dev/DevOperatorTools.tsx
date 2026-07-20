import { useEffect, useState } from 'react'
import { isSystem } from '../../domain/timeline'
import { useChatStore } from '../../hooks/useChatStore'
import { t } from '../../i18n'
import { selectUserId } from '../../store/selectors'
import { chatStore } from '../../store/store'
import styles from './DevOperatorTools.module.css'

// Фолбэк, пока в комнате ещё нет ни одного операторского сообщения
const DEV_OPERATOR_FALLBACK_ID = '@operator:bank'

// Только матрица-мок (tools/matrix-mock) понимает этот путь — реальный MatrixKC вернёт 404,
// это ожидаемо и безвредно (fetch пойдёт в catch, галочка останется в дефолтном состоянии).
const HISTORY_TOGGLE_URL = '/_dev/history-toggle'

// Реальный MatrixKC на этот путь не отвечает — ошибка молча проглатывается в обоих случаях.
function syncHistoryToggle(init?: RequestInit): Promise<Response | void> {
  return fetch(HISTORY_TOGGLE_URL, init).catch(() => {})
}

export function DevOperatorTools() {
  const [text, setText] = useState('')
  const [isNotice, setIsNotice] = useState(false)
  const [isHistoryEnabled, setIsHistoryEnabled] = useState(true)
  const userId = useChatStore(selectUserId)

  // Подтягиваем актуальное состояние с мока: другая вкладка/перезапуск мока могли его сменить.
  useEffect(() => {
    syncHistoryToggle()
      .then((res) => res?.json() as Promise<{ enabled: boolean }> | undefined)
      .then((body) => body && setIsHistoryEnabled(body.enabled))
  }, [])

  const toggleHistory = (enabled: boolean) => {
    setIsHistoryEnabled(enabled)
    void syncHistoryToggle({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    })
  }

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
      <label
        className={styles.noticeToggle}
        title={t('dev.historyToggleHint')}
      >
        <input
          type="checkbox"
          checked={isHistoryEnabled}
          onChange={(e) => toggleHistory(e.target.checked)}
        />
        {t('dev.historyToggle')}
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
