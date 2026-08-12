export const MatrixEventType = {
  RoomMessage: 'm.room.message',
  Reaction: 'm.reaction',
  Redaction: 'm.room.redaction',
  OperatorCurrent: 'kc.operator.current',
  OperatorJoined: 'kc.operator.joined',
  OperatorLeft: 'kc.operator.left',
  Receipt: 'm.receipt',
} as const

export const RelType = {
  Annotation: 'm.annotation',
} as const

export const MsgType = {
  Text: 'm.text',
  Notice: 'm.notice',
  Image: 'm.image',
  File: 'm.file',
} as const

export const ReceiptType = {
  Read: 'm.read',
} as const

export const OperatorStatus = {
  Active: 'active',
  Left: 'left',
} as const
