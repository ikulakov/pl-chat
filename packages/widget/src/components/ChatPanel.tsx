import { useChatActions } from '../hooks/useChatActions'
import { useChatStore } from '../hooks/useChatStore'
import { t } from '../i18n'
import { Spinner } from '../shared/ui/Spinner'
import { selectOperator, selectStatus, selectUserId } from '../store/selectors'
import chatStyles from './ChatPanel.module.css'
import { DevOperatorTools } from './dev/DevOperatorTools'
import { Header } from './Header'
import { MessageInput } from './MessageInput'
import { MessageList } from './MessageList/MessageList'
import { StatusScreen } from './StatusScreen'
import statusStyles from './StatusScreen.module.css'

export function ChatPanel() {
  const status = useChatStore(selectStatus)
  const userId = useChatStore(selectUserId)
  const operator = useChatStore(selectOperator)

  const { reconnect } = useChatActions()

  return (
    <div className={chatStyles.panel}>
      {import.meta.env.DEV && <DevOperatorTools />}

      <Header
        name={operator.isActive && operator.displayName ? operator.displayName : t('header.name')}
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
        <>
          <MessageList userId={userId} />
          <MessageInput />
        </>
      )}
    </div>
  )
}
