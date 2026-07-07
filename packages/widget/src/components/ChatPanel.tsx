import { useChatActions } from '../hooks/useChatActions'
import { useChatStore } from '../hooks/useChatStore'
import { t } from '../i18n'
import { Spinner } from '../shared/ui/Spinner'
import chatStyles from './ChatPanel.module.css'
import { Header } from './Header'
import { MessageInput } from './MessageInput'
import { MessageList } from './MessageList'
import { StatusScreen } from './StatusScreen'
import statusStyles from './StatusScreen.module.css'

export function ChatPanel() {
  const status = useChatStore((s) => s.status)
  const { retry } = useChatActions()

  return (
    <div className={chatStyles.panel}>
      <Header
        name={t('header.name')}
        subtitle={t('header.subtitle')}
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
          illustration={`${import.meta.env.BASE_URL}/error-illustration.png`}
          action={
            <button
              className={statusStyles.retryBtn}
              onClick={retry}
            >
              {t('status.error.retry')}
            </button>
          }
        />
      )}

      {(status === 'waiting' || status === 'active') && (
        <>
          <MessageList />
          <MessageInput />
        </>
      )}
    </div>
  )
}
