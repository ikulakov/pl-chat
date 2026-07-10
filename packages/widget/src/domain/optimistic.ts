import type { TextTimelineItem } from './timeline'

export interface OutgoingText {
  message: TextTimelineItem
  txnId: string
}

export function createOptimisticTextMessage(sender: string, text: string): OutgoingText {
  const localId = crypto.randomUUID()
  const txnId = crypto.randomUUID()
  return {
    message: {
      kind: 'text',
      localId,
      eventId: `optimistic:${localId}`,
      txnId,
      sender,
      ts: Date.now(),
      sendStatus: 'sending',
      content: { body: text },
    },
    txnId,
  }
}
