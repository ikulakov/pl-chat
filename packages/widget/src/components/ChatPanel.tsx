import { useChatActions } from '../hooks/useChatActions'
import { useChatStore } from '../hooks/useChatStore'
import { t } from '../i18n'
import { ERROR_ILLUSTRATION } from '../shared/assets/inlineAssets'
import { Spinner } from '../shared/ui/Spinner'
import { isChatting, selectStatus, selectUserId, selectViewport } from '../store/selectors'
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
  const viewport = useChatStore(selectViewport)

  const { reconnect } = useChatActions()

  return (
    <div className={chatStyles.panel}>
      {import.meta.env.DEV && <DevOperatorTools />}

      <Header />

      {(status === 'idle' || status === 'connecting') && (
        <StatusScreen>
          <Spinner />
        </StatusScreen>
      )}

      {status === 'error' && (
        <StatusScreen
          title={t('status.error')}
          subtitle={t('status.error.subtitle')}
          illustration={ERROR_ILLUSTRATION}
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

      {isChatting(status) && userId !== null && (
        <AttachmentProvider dropZoneEnabled={viewport !== 'fullscreen'}>
          <MessageList userId={userId} />
          <Composer />
        </AttachmentProvider>
      )}
    </div>
  )
}
