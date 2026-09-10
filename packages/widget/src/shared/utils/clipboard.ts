import { consoleDev } from './consoleDev'

// Копирование в буфер обмена: тихо деградирует, если Clipboard API недоступен.
export function copyText(text: string): void {
  if (!navigator.clipboard?.writeText) {
    consoleDev.warn('clipboard API unavailable — copy skipped')
    return
  }
  navigator.clipboard.writeText(text).catch((err: unknown) => {
    consoleDev.warn('clipboard write failed', err)
  })
}
