export const MATRIX_API_PREFIX = '/_matrix/client/v3'

export const MatrixEventType = {
  RoomMessage: 'm.room.message',
  OperatorCurrent: 'kc.operator.current',
} as const

export const MsgType = {
  Text: 'm.text',
} as const

export const OperatorStatus = {
  Active: 'active',
  Left: 'left',
} as const
