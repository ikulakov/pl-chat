import type { UploadFailure } from '../../domain/uploadError'
import {
  isForbiddenError,
  isHttpStatus,
  isMatrixError,
  isRateLimitedError,
  MatrixErrCode,
} from '../api/matrixError'

/**
 * Ошибка транспорта → доменная причина отказа. Живёт в `matrix/`, а не в `domain/`, потому что
 * читает коды провода: доменной стороне достаётся уже переведённая причина.
 */
export function classifyUploadError(err: unknown): UploadFailure {
  // 400 — fileguard: тип не из whitelist, подмена типа, некорректное имя. 413 — больше 50 МБ.
  // 403 — media-слой выключен администратором. Ответ на повтор будет тем же самым.
  const rejected =
    isMatrixError(err, MatrixErrCode.InvalidParam) ||
    isMatrixError(err, MatrixErrCode.TooLarge) ||
    isForbiddenError(err) ||
    isHttpStatus(err, 400) ||
    isHttpStatus(err, 413)

  if (rejected) return 'rejected'
  if (isRateLimitedError(err) || isHttpStatus(err, 429)) return 'rateLimited'

  // Сеть, 5xx, обрыв сессии — повтор осмыслен.
  return 'network'
}
