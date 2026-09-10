import { type InitConfig } from '@bankchat/protocol'
import type { PanelAppearance } from './panel/appearance'
import type { PreloadMode } from './preload'

const PRELOAD_MODES: readonly PreloadMode[] = ['idle', 'eager', 'on-open']

// Публичный конфиг, который хост передаёт в ChatSDK.init()
export interface LoaderConfig extends Omit<InitConfig, 'viewport'> {
  /** Источник истины для origin и URL виджета, напр. https://chat.bank.com */
  chatUrl: string
  /** Позиция и слой контейнера виджета на странице хоста. */
  appearance?: PanelAppearance
  /**
   * Когда качать бандл виджета. По умолчанию `idle`.
   * - `idle` — после события `load` хоста (но не дольше 5 с: на реальных страницах
   *   `load` может не наступить вовсе), в первом простое браузера. Открытие мгновенное,
   *   загрузка не конкурирует с критическим путём страницы;
   * - `eager` — сразу на `init()`;
   * - `on-open` — только по первому открытию. Экономит трафик там, где чат почти не
   *   открывают, ценой задержки первого открытия (замер: ~0.3 с на LTE, ~1.2 с на
   *   Fast 3G, ~4 с на Slow 3G при пустом кеше).
   */
  preload?: PreloadMode
}

export function validateConfig(cfg: LoaderConfig): void {
  if (!cfg.chatUrl) throw new Error('Plchat: chatUrl is required')
  let url: URL
  try {
    url = new URL(cfg.chatUrl)
  } catch {
    throw new Error('Plchat: chatUrl is not a valid URL')
  }
  const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !isLocalhost) {
    throw new Error('Plchat: chatUrl must use HTTPS')
  }
  if (cfg.preload !== undefined && !PRELOAD_MODES.includes(cfg.preload)) {
    throw new Error(`Plchat: preload must be one of ${PRELOAD_MODES.join(', ')}`)
  }
}

/** Нормализованный origin chat-сервера (scheme + host + port, без path). */
export function chatOrigin(cfg: LoaderConfig): string {
  return new URL(cfg.chatUrl).origin
}

/** URL документа виджета с parentOrigin для READY-beacon. */
export function widgetUrl(cfg: LoaderConfig, parentOrigin: string): string {
  const url = new URL('/widget/', chatOrigin(cfg))
  url.searchParams.set('parentOrigin', parentOrigin)
  return url.toString()
}
