import { useEffect } from 'react'
import { useChatActions } from '../hooks/useChatActions'
import { useChatStore } from '../hooks/useChatStore'
import { t } from '../i18n'
import { ensureEmojiIndex } from '../shared/emoji/emojiIndexStore'
import { Spinner } from '../shared/ui/Spinner'
import {
  selectOperator,
  selectOperatorName,
  selectStatus,
  selectUserId,
  selectViewport,
} from '../store/selectors'
import { AttachmentProvider } from './Attachment/AttachmentProvider'
import chatStyles from './ChatPanel.module.css'
import { Composer } from './Composer/Composer'
import { DevOperatorTools } from './dev/DevOperatorTools'
import { Header } from './Header'
import { MessageList } from './MessageList/MessageList'
import { StatusScreen } from './StatusScreen'
import statusStyles from './StatusScreen.module.css'

export function ChatPanel() {
  const status = useChatStore(selectStatus)
  const userId = useChatStore(selectUserId)
  const operator = useChatStore(selectOperator)
  const operatorName = useChatStore(selectOperatorName)
  const viewport = useChatStore(selectViewport)

  const { reconnect, loadEmojiIndex } = useChatActions()

  // Индекс пака тянем один раз на вкладку и отсюда: лента и цитаты его только читают.
  // Ждём userId: каталог отдаётся под токеном (permitAll только у /_matrix/emoji/** и
  // /_matrix/sticker/**), а mount-эффект иначе гонится с регистрацией гостя и получает 401 —
  // без refresh-токена его нечем починить, и вся отрисовка эмодзи молча оставалась бы
  // выключенной до перезагрузки страницы.
  useEffect(() => {
    if (userId === null) return

    ensureEmojiIndex(loadEmojiIndex)
  }, [loadEmojiIndex, userId])

  return (
    <div className={chatStyles.panel}>
      {import.meta.env.DEV && <DevOperatorTools />}

      <Header
        name={operatorName}
        subtitle={operator.isActive ? t('header.operatorSubtitle') : t('header.subtitle')}
      />

      {(status === 'idle' || status === 'connecting') && (
        <StatusScreen>
          <Spinner />
        </StatusScreen>
      )}

      {status === 'error' && (
        <StatusScreen
          title={t('status.error')}
          subtitle={t('status.error.subtitle')}
          illustration={'/error-illustration.png'}
          action={
            <button
              className={statusStyles.retryBtn}
              onClick={reconnect}
            >
              {t('status.error.retry')}
            </button>
          }
        />
      )}

      {(status === 'waiting' || status === 'active') && userId !== null && (
        <AttachmentProvider dropZoneEnabled={viewport !== 'fullscreen'}>
          <MessageList userId={userId} />
          <Composer />
        </AttachmentProvider>
      )}
    </div>
  )
}
