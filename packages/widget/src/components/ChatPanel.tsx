import { useChatActions } from '../hooks/useChatActions'
import { useChatStore } from '../hooks/useChatStore'
import { t } from '../i18n'
import { ERROR_ILLUSTRATION } from '../shared/assets/inlineAssets'
import welcomeIllustration from '../shared/assets/welcome-illustration.webp'
import { externalLinks } from '../shared/constants/externalLinks'
import { Spinner } from '../shared/ui/Spinner'
import { selectHasMessages, selectPhase, selectUserId, selectViewport } from '../store/selectors'
import { AttachmentProvider } from './Attachment/AttachmentProvider'
import chatStyles from './ChatPanel.module.css'
import { Composer } from './Composer/Composer'
import { DevOperatorTools } from './dev/DevOperatorTools'
import { Header } from './Header'
import { MessageList } from './MessageList/MessageList'
import { StatusScreen } from './StatusScreen'
import statusStyles from './StatusScreen.module.css'

export function ChatPanel() {
  const phase = useChatStore(selectPhase)
  const userId = useChatStore(selectUserId)
  const viewport = useChatStore(selectViewport)
  const hasMessages = useChatStore(selectHasMessages)

  const { reconnect } = useChatActions()

  return (
    <div className={chatStyles.panel}>
      {import.meta.env.DEV && <DevOperatorTools />}

      <Header />

      {(phase === 'idle' || phase === 'connecting' || phase === 'recovering') && (
        <StatusScreen>
          <Spinner />
        </StatusScreen>
      )}

      {phase === 'error' && (
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

      {phase === 'ready' && userId !== null && (
        <AttachmentProvider dropZoneEnabled={viewport !== 'fullscreen'}>
          {hasMessages ? (
            <MessageList userId={userId} />
          ) : (
            <StatusScreen
              title={t('status.welcome')}
              subtitle={t('status.welcome.subtitle')}
              illustration={welcomeIllustration}
              caption={
                <>
                  <p>{t('chat.personalPolicy')}</p>
                  <a
                    href={externalLinks.PERSONAL_POLICY}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t('chat.showMore')}
                  </a>
                </>
              }
            />
          )}
          <Composer />
        </AttachmentProvider>
      )}
    </div>
  )
}
