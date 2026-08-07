/**
 * Почему байты вложения недоступны. Коды и статусы провода читает только `matrix/` —
 * наружу выходит уже переведённая причина, как и у заливки (см. `UploadFailure`).
 */
export type MediaFailure =
  // файл ещё в конвейере проверки на сервере: повтор осмыслен, когда вердикт будет вынесен
  | 'pending'
  // проверка не пройдена либо файла нет — повтором не лечится
  | 'rejected'
  // сеть, таймаут, 5xx — повтор осмыслен прямо сейчас
  | 'failed'

/** Отказ отдачи медиа в доменных терминах: единственная форма, в которой он доходит до UI. */
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
