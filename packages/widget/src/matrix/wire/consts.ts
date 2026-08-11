export const MatrixEventType = {
  RoomMessage: 'm.room.message',
  OperatorCurrent: 'kc.operator.current',
  OperatorJoined: 'kc.operator.joined',
  OperatorLeft: 'kc.operator.left',
  MediaStatus: 'kc.media.status',
  Receipt: 'm.receipt',
} as const

export const MediaScanStatus = {
  Ready: 'ready',
  Rejected: 'rejected',
} as const

export const MsgType = {
  Text: 'm.text',
  Notice: 'm.notice',
  Image: 'm.image',
  File: 'm.file',
  AdaptiveCard: 'kc.adaptive.v1',
  AdaptiveAction: 'kc.adaptive.action',
} as const

export const ReceiptType = {
  Read: 'm.read',
} as const

export const OperatorStatus = {
  Active: 'active',
  Left: 'left',
} as const
