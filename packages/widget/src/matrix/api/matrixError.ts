interface MatrixErrorBody {
  errcode?: string
  error?: string
  retry_after_ms?: number
}

export class MatrixError extends Error {
  readonly errcode: string
  // Только для M_LIMIT_EXCEEDED (429): сервер отдаёт задержку в теле, заголовка
  // Retry-After нет. Повторять раньше бессмысленно — окно фиксированное.
  readonly retryAfterMs?: number

  constructor(errcode: string, message: string, retryAfterMs?: number) {
    super(message)
    this.name = 'MatrixError'
    this.errcode = errcode
    if (retryAfterMs !== undefined) this.retryAfterMs = retryAfterMs
  }
}

export function makeMatrixError(status: number, text: string): MatrixError {
  try {
    const body = JSON.parse(text) as MatrixErrorBody
    return new MatrixError(
      body.errcode ?? MatrixErrCode.Unknown,
      body.error ?? `HTTP ${status}`,
      body.retry_after_ms,
    )
  } catch {
    return new MatrixError(MatrixErrCode.Unknown, `HTTP ${status}`)
  }
}

export const MatrixErrCode = {
  Unknown: 'M_UNKNOWN',
  UnknownToken: 'M_UNKNOWN_TOKEN',
  UserDeactivated: 'M_USER_DEACTIVATED',
  RoomNotFound: 'M_ROOM_NOT_FOUND',
  LimitExceeded: 'M_LIMIT_EXCEEDED',
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

export function isRateLimitedError(err: unknown): err is MatrixError {
  return isMatrixError(err, MatrixErrCode.LimitExceeded)
}

export type AuthErrorContext =
  | 'sync'
  | 'sendMessage'
  | 'resendMessage'
  | 'sendFile'
  | 'markRead'
  | 'loadHistory'
