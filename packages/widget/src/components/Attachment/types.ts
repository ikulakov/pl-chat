import type { EventId } from '@/shared/types/ids'
import type { FileRejection } from '@/shared/utils/fileValidation'

/** Выбранный, но ещё не отправленный файл — то, что видит композер. */
export interface PendingAttachment {
  file: File
  previewUrl?: string
  /** отбраковка при выборе (формат, размер): файл виден в композере, но отправить нельзя */
  error?: FileRejection
}

export interface SendOptions {
  caption?: string | undefined
  replyToEventId?: EventId | undefined
}

/** Состояние вложения, которое слайс раздаёт контекстом. */
export interface FileAttachment {
  pending: PendingAttachment | null
  pickFile: (file: File) => void
  cancel: () => void
  send: (options?: SendOptions) => void
}
