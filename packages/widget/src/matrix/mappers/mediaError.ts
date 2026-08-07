import type { MediaFailure } from '../../domain/mediaError'
import { isMediaPendingError, isNotFoundError } from '../api/matrixError'

/**
 * Ошибка отдачи медиа → доменная причина. Живёт в `matrix/`, потому что читает коды провода:
 * статусная машина карантина CDR наблюдаема только по ним — 504 «ещё проверяем», 404 «нет».
 * 403 отдельной причины не получает: к нам он попадает уже пережившим отложенный повтор, и
 * с точки зрения UI это обычный сбой — прав могло не быть, а могла не успеть запись привязки.
 */
export function classifyMediaError(err: unknown): MediaFailure {
  if (isMediaPendingError(err)) return 'pending'
  if (isNotFoundError(err)) return 'rejected'

  return 'failed'
}
