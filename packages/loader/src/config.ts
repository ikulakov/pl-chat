import { type InitConfig } from '@bankchat/protocol'

/** Публичный конфиг, который хост передаёт в ChatSDK.init(). */
export interface LoaderConfig extends InitConfig {
  /** Источник истины для origin и URL виджета, напр. https://chat.bank.com */
  chatUrl: string
}

export function validateConfig(cfg: LoaderConfig): void {
  if (!cfg.chatUrl) throw new Error('BankChat: chatUrl is required')
  let url: URL
  try {
    url = new URL(cfg.chatUrl)
  } catch {
    throw new Error('BankChat: chatUrl is not a valid URL')
  }
  const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !isLocalhost) {
    throw new Error('BankChat: chatUrl must use HTTPS')
  }
}

/** Нормализованный origin chat-сервера (scheme + host + port, без path). */
export function chatOrigin(cfg: LoaderConfig): string {
  return new URL(cfg.chatUrl).origin
}

/** URL документа виджета с parentOrigin для READY-beacon. */
export function widgetUrl(cfg: LoaderConfig, parentOrigin: string): string {
  const url = new URL('/widget', chatOrigin(cfg))
  url.searchParams.set('parentOrigin', parentOrigin)
  return url.toString()
}
