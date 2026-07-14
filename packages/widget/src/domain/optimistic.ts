import type { TextTimelineItem } from './timeline'

const OPTIMISTIC_PREFIX = 'optimistic:'

export function isOptimistic(eventId: string): boolean {
  return eventId.startsWith(OPTIMISTIC_PREFIX)
}

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
      eventId: `${OPTIMISTIC_PREFIX}${localId}`,
      txnId,
      sender,
      ts: Date.now(),
      sendStatus: 'sending',
      content: { body: text },
    },
    txnId,
  }
}
