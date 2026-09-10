import { useChatActions } from '../hooks/useChatActions'
import { useChatStore } from '../hooks/useChatStore'
import { t } from '../i18n'
import { ERROR_ILLUSTRATION } from '../shared/assets/inlineAssets'
import welcomeIllustration from '../shared/assets/welcome-illustration.webp'
import { externalLinks } from '../shared/constants/externalLinks'
import { Spinner } from '../shared/ui/Spinner'
import { StatusScreen, StatusScreenAction, StatusScreenImage } from '../shared/ui/StatusScreen'
import { selectHasMessages, selectPhase, selectUserId, selectViewport } from '../store/selectors'
import { AttachmentProvider } from './Attachment/AttachmentProvider'
import chatStyles from './ChatPanel.module.css'
import { Composer } from './Composer/Composer'
import { DevOperatorTools } from './dev/DevOperatorTools'
import { Header } from './Header'
import { MessageList } from './MessageList/MessageList'

export function ChatPanel() {
  const phase = useChatStore(selectPhase)
  const userId = useChatStore(selectUserId)
  const viewport = useChatStore(selectViewport)
  const hasMessages = useChatStore(selectHasMessages)
  const isSessionPending = phase === 'idle' || phase === 'connecting' || phase === 'recovering'

  const { reconnect } = useChatActions()

  return (
    <div className={chatStyles.panel}>
      {import.meta.env.DEV && <DevOperatorTools />}

      <Header />

      {isSessionPending && <StatusScreen media={<Spinner />} />}

      {phase === 'error' && (
        <StatusScreen
          title={t('status.error')}
          description={t('status.error.subtitle')}
          media={
            <StatusScreenImage
              src={ERROR_ILLUSTRATION}
              width={296}
              height={148}
            />
          }
          actions={
            <StatusScreenAction onClick={reconnect}>{t('status.error.retry')}</StatusScreenAction>
          }
          role="alert"
        />
      )}

      {phase === 'ready' && userId !== null && (
        <AttachmentProvider dropZoneEnabled={viewport !== 'fullscreen'}>
          {hasMessages ? (
            <MessageList userId={userId} />
          ) : (
            <StatusScreen
              title={t('status.welcome')}
              description={t('status.welcome.subtitle')}
              media={
                <StatusScreenImage
                  src={welcomeIllustration}
                  width={275}
                  height={188}
                />
              }
              footer={
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
