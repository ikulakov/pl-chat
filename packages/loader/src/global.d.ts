import type { BankChatClient } from './client'

declare global {
  interface Window {
    ChatSDK: BankChatClient
  }
}
