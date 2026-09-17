import { consoleDev } from './consoleDev'

// Копирование в буфер обмена: тихо деградирует, если Clipboard API недоступен.
export async function copyText(text: string): Promise<boolean> {
  if (!navigator.clipboard?.writeText) {
    consoleDev.warn('clipboard API unavailable — copy skipped')
    return false
  }

  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (err: unknown) {
    consoleDev.warn('clipboard write failed', err)
    return false
  }
}
