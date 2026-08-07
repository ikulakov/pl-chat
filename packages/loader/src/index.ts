import { BankChatClient } from './client'

window.ChatSDK = window.ChatSDK ?? new BankChatClient()

export const ChatSDK = window.ChatSDK
