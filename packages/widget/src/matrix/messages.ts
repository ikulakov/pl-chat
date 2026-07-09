import type { ChatMessage } from '../store/model'

export interface OutgoingText {
  message: ChatMessage
  txnId: string
}

export function createOptimisticTextMessage(sender: string, text: string): OutgoingText {
  const localId = crypto.randomUUID()
  return {
    message: {
      localId,
      eventId: `optimistic:${localId}`,
      sender,
      body: text,
      ts: Date.now(),
      pending: true,
      failed: false,
    },
    txnId: crypto.randomUUID(),
  }
}
