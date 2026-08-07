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
  // HTTP-статус ответа
  readonly status?: number

  constructor(errcode: string, message: string, retryAfterMs?: number, status?: number) {
    super(message)
    this.name = 'MatrixError'
    this.errcode = errcode
    if (retryAfterMs !== undefined) this.retryAfterMs = retryAfterMs
    if (status !== undefined) this.status = status
  }
}

export function makeMatrixError(status: number, text: string): MatrixError {
  try {
    const body = JSON.parse(text) as MatrixErrorBody
    return new MatrixError(
      body.errcode ?? MatrixErrCode.Unknown,
      body.error ?? `HTTP ${status}`,
      body.retry_after_ms,
      status,
    )
  } catch {
    return new MatrixError(MatrixErrCode.Unknown, `HTTP ${status}`, undefined, status)
  }
}

export const MatrixErrCode = {
  Unknown: 'M_UNKNOWN',
  UnknownToken: 'M_UNKNOWN_TOKEN',
  UserDeactivated: 'M_USER_DEACTIVATED',
  RoomNotFound: 'M_ROOM_NOT_FOUND',
  LimitExceeded: 'M_LIMIT_EXCEEDED',
  InvalidParam: 'M_INVALID_PARAM',
  TooLarge: 'M_TOO_LARGE',
  Forbidden: 'M_FORBIDDEN',
  NotYetUploaded: 'M_NOT_YET_UPLOADED',
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

/** Единственное место, где читается HTTP-статус ошибки: остальные предикаты идут через него. */
export function isHttpStatus(err: unknown, status: number): boolean {
  return err instanceof MatrixError && err.status === status
}

/** 404 — терминально: неизвестный mediaId, отклонённый CDR файл либо превью не генерировалось. */
export function isNotFoundError(err: unknown): boolean {
  return isHttpStatus(err, 404)
}

/** 403 — нет прав на файл (в т.ч. пока writer не записал привязку файла к комнате). */
export function isForbiddenError(err: unknown): boolean {
  return isHttpStatus(err, 403) && !isUserDeactivatedError(err)
}

/** 504 M_NOT_YET_UPLOADED — файл ещё в конвейере проверки. Это не ошибка, а «подождите». */
export function isMediaPendingError(err: unknown): boolean {
  return isHttpStatus(err, 504) || isMatrixError(err, MatrixErrCode.NotYetUploaded)
}

export type AuthErrorContext =
  | 'sync'
  | 'sendMessage'
  | 'resendMessage'
  | 'sendFile'
  | 'markRead'
  | 'loadHistory'
