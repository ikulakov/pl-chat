/**
 * Отказы вложений в доменных терминах. Коды и статусы провода читает только `matrix/`
 * (`matrix/mappers/uploadError`, `matrix/mappers/mediaError`) — сюда доходит уже причина,
 * и UI по ней решает одно: предлагать повтор или нет.
 */

/**
 * Почему сорвалась загрузка файла. Детерминированный отказ сервера (fileguard, лимит размера,
 * выключенный media-слой) повтором не лечится: вместо «повторить» даём убрать черновик из ленты.
 */
export type UploadFailure = 'network' | 'rejected' | 'rateLimited'

export function isRetryableFailure(failure: UploadFailure | undefined): boolean {
  return failure !== 'rejected'
}

/** Почему байты вложения недоступны при скачивании. */
export type MediaFailure =
  // файл ещё в конвейере проверки на сервере: повтор осмыслен, когда вердикт будет вынесен
  | 'pending'
  // проверка не пройдена либо файла нет — повтором не лечится
  | 'rejected'
  // сеть, таймаут, 5xx — повтор осмыслен прямо сейчас
  | 'failed'

/** Отказ отдачи медиа: единственная форма, в которой он доходит до UI. */
export class MediaUnavailableError extends Error {
  readonly reason: MediaFailure

  constructor(reason: MediaFailure, options?: ErrorOptions) {
    super(`Media unavailable: ${reason}`, options)
    this.name = 'MediaUnavailableError'
    this.reason = reason
  }
}

/** Причина для UI. Всё остальное (баг в коде, отмена) читается как обычный сбой. */
export function toMediaFailure(err: unknown): MediaFailure {
  return err instanceof MediaUnavailableError ? err.reason : 'failed'
}
