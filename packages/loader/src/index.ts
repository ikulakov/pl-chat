import { BankChatClient } from './client'

window.ChatSDK = window.ChatSDK ?? new BankChatClient()

export const ChatSDK = window.ChatSDK

export type { LoaderConfig } from './config'
export type { PanelAppearance, PanelCorner } from './panel/appearance'
