// Копирование в буфер обмена: тихо деградирует, если Clipboard API недоступен.
export function copyText(text: string): void {
  if (!navigator.clipboard?.writeText) {
    console.warn('[PLChat] clipboard API unavailable — copy skipped')
    return
  }
  navigator.clipboard.writeText(text).catch((err: unknown) => {
    console.warn('[PLChat] clipboard write failed:', err)
  })
}
