import { Component, type ReactNode } from 'react'
import { t } from '../i18n'
import { ERROR_ILLUSTRATION } from '../shared/assets/inlineAssets'
import { StatusScreen, StatusScreenAction, StatusScreenImage } from '../shared/ui/StatusScreen'
import styles from './ErrorBoundary.module.css'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  private reset = (): void => {
    this.setState({ hasError: false })
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className={styles.wrapper}>
          <StatusScreen
            title={t('status.crash')}
            description={t('status.crash.subtitle')}
            media={
              <StatusScreenImage
                src={ERROR_ILLUSTRATION}
                width={296}
                height={148}
              />
            }
            actions={
              <StatusScreenAction onClick={this.reset}>
                {t('status.crash.retry')}
              </StatusScreenAction>
            }
            role="alert"
          />
        </div>
      )
    }

    return this.props.children
  }
}
