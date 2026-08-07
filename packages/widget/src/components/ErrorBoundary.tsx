import { Component, type ReactNode } from 'react'
import { t } from '../i18n'
import styles from './ErrorBoundary.module.css'
import { StatusScreen } from './StatusScreen'
import statusStyles from './StatusScreen.module.css'

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
            subtitle={t('status.crash.subtitle')}
            illustration={`/error-illustration.png`}
            action={
              <button
                className={statusStyles.retryBtn}
                onClick={this.reset}
              >
                {t('status.crash.retry')}
              </button>
            }
          />
        </div>
      )
    }

    return this.props.children
  }
}
