import { useChatActions } from '@/hooks/useChatActions'
import { useChatStore } from '@/hooks/useChatStore'
import { t } from '@/i18n'
import { ERROR_ILLUSTRATION } from '@/shared/assets/inlineAssets'
import welcomeIllustration from '@/shared/assets/welcome-illustration.webp'
import { externalLinks } from '@/shared/constants/externalLinks'
import { Spinner } from '@/shared/ui/Spinner'
import { StatusScreen, StatusScreenAction, StatusScreenImage } from '@/shared/ui/StatusScreen'
import {
  selectIsRoomEmpty,
  selectPanelView,
  selectPhase,
  selectUserId,
  selectViewport,
} from '@/store/selectors'
import { AttachmentProvider } from '../Attachment'
import chatStyles from './ChatPanel.module.css'
import { Composer } from '../Composer'
import { DevOperatorTools } from '../DevOperatorTools'
import { ErrorBoundary } from '../ErrorBoundary'
import { Header } from '../Header'
import { MessageList } from '../MessageList'

export function ChatPanel() {
  const view = useChatStore(selectPanelView)
  const phase = useChatStore(selectPhase)
  const userId = useChatStore(selectUserId)
  const viewport = useChatStore(selectViewport)
  const isRoomEmpty = useChatStore(selectIsRoomEmpty)

  const { reconnect } = useChatActions()

  return (
    <div className={chatStyles.panel}>
      {import.meta.env.DEV && <DevOperatorTools />}

      <Header />

      <ErrorBoundary>
        {view === 'loading' && <StatusScreen media={<Spinner delayed />} />}

        {view === 'error' && (
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
              <StatusScreenAction
                loading={phase === 'retrying'}
                onClick={reconnect}
              >
                {t('status.error.retry')}
              </StatusScreenAction>
            }
            role="alert"
          />
        )}

        {view === 'chat' && (
          <AttachmentProvider dropZoneEnabled={viewport !== 'fullscreen'}>
            {!isRoomEmpty && userId ? (
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
      </ErrorBoundary>
    </div>
  )
}
