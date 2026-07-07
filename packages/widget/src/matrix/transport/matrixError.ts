export class MatrixError extends Error {
  readonly errcode: string

  constructor(errcode: string, message: string) {
    super(message)
    this.name = 'MatrixError'
    this.errcode = errcode
  }
}

export const MatrixErrCode = {
  Unknown: 'M_UNKNOWN',
  UnknownToken: 'M_UNKNOWN_TOKEN',
  UserDeactivated: 'M_USER_DEACTIVATED',
  RoomNotFound: 'M_ROOM_NOT_FOUND',
} as const

type MatrixErrCodeValue = (typeof MatrixErrCode)[keyof typeof MatrixErrCode]

export function isMatrixError(err: unknown, errcode?: MatrixErrCodeValue): err is MatrixError {
  if (!(err instanceof MatrixError)) return false
  return errcode === undefined || err.errcode === errcode
}

export function isMatrixAuthError(err: unknown): boolean {
  return isMatrixError(err, MatrixErrCode.UnknownToken)
}

export function isUserDeactivatedError(err: unknown): boolean {
  return isMatrixError(err, MatrixErrCode.UserDeactivated)
}
