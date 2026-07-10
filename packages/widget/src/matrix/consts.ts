export const MATRIX_API_PREFIX = '/_matrix/client/v3'

export const MatrixEventType = {
  RoomMessage: 'm.room.message',
  OperatorCurrent: 'kc.operator.current',
  OperatorJoined: 'kc.operator.joined',
  OperatorLeft: 'kc.operator.left',
} as const

export const MsgType = {
  Text: 'm.text',
  Notice: 'm.notice',
} as const

export const OperatorStatus = {
  Active: 'active',
  Left: 'left',
} as const
