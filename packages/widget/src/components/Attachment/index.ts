// Публичный API слайса: провайдер состояния вложения (вместе с DropZone) и доступ к нему.
// Состояние раздаётся контекстом, а не стором: File, AbortController и object-URL живут,
// пока смонтирована панель.
export { useAttachment } from './AttachmentContext'
export { AttachmentProvider } from './ui/AttachmentProvider'
export type { PendingAttachment } from './types'
