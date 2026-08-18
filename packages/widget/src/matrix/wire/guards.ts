import { MatrixEventType } from './consts'
import type * as Matrix from './types'

export function isRoomMessage(event: Matrix.ClientEvent): event is Matrix.RoomMessageEvent {
  return event.type === MatrixEventType.RoomMessage
}

export function isStickerEvent(event: Matrix.ClientEvent): event is Matrix.StickerEvent {
  return event.type === MatrixEventType.Sticker
}

export function isReaction(event: Matrix.ClientEvent): event is Matrix.ReactionEvent {
  return event.type === MatrixEventType.Reaction
}

export function isRedaction(event: Matrix.ClientEvent): event is Matrix.RedactionEvent {
  return event.type === MatrixEventType.Redaction
}

export function isOperatorJoined(event: Matrix.ClientEvent): event is Matrix.OperatorJoinedEvent {
  return event.type === MatrixEventType.OperatorJoined
}

export function isOperatorLeft(event: Matrix.ClientEvent): event is Matrix.OperatorLeftEvent {
  return event.type === MatrixEventType.OperatorLeft
}

export function isOperatorCurrent(event: Matrix.ClientEvent): event is Matrix.OperatorCurrentEvent {
  return event.type === MatrixEventType.OperatorCurrent && event.state_key === ''
}

export function isMediaStatusEvent(event: Matrix.ClientEvent): event is Matrix.MediaStatusEvent {
  return event.type === MatrixEventType.MediaStatus
}

export function isReceiptEvent(event: Matrix.EphemeralEvent): event is Matrix.ReceiptEvent {
  return event.type === MatrixEventType.Receipt
}
