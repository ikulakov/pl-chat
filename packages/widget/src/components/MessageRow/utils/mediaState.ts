import { isRetryableFailure } from '@/domain/mediaFailure'
import { isMedia, type MediaTimelineItem, type MessageTimelineItem } from '@/domain/timeline'

/**
 * Что сейчас с вложением. Картинка и файл показывают это по-своему (оверлей на кадре против
 * блока у имени), а выводят одинаково — здесь, чтобы правила не разъехались.
 */
export type MediaState =
  // своя заливка идёт — её можно отменить
  | { status: 'uploading'; pct: number }
  // своя заливка сорвалась; не retryable — отказ fileguard'а, повтор получит тот же ответ
  | { status: 'uploadFailed'; retryable: boolean }
  // проверка на сервере отбраковала файл — скачать его уже нельзя
  | { status: 'rejected' }
  // байты на сервере, упал только /send; повтор — в меню сообщения
  | { status: 'sendFailed' }
  // файл на сервере, его можно скачать
  | { status: 'available' }

/** `isRejected` — вердикт проверки; откуда его брать, решает вызывающий. */
export function getMediaState(item: MediaTimelineItem, isRejected: boolean): MediaState {
  const uploadState = getUploadState(item)
  if (uploadState) return uploadState

  // Отбраковка важнее упавшего /send: файл не скачается, даже если сообщение отправить заново.
  if (isRejected) return { status: 'rejected' }
  if (item.sendStatus === 'failed') return { status: 'sendFailed' }
  return { status: 'available' }
}

/**
 * Время и статус прячем, пока своя заливка идёт или сорвалась: об этом уже говорит само вложение
 * (кольцо прогресса, рамка, действие), а крестик статуса рядом читался бы другой ошибкой.
 * Заливка бывает только у картинки и файла — у остальных сообщений время всегда на месте.
 */
export function isMediaMetaHidden(item: MessageTimelineItem): boolean {
  return isMedia(item) && getUploadState(item) !== null
}

/** Своя заливка — идёт или сорвалась. null — байты не льются: файл чужой или уже на сервере. */
function getUploadState({ upload, sendStatus }: MediaTimelineItem): MediaState | null {
  // upload есть только у своего черновика; редьюсер снимает его сразу после заливки
  if (!upload) return null

  if (sendStatus === 'sending' && upload.pct !== null) {
    return { status: 'uploading', pct: upload.pct }
  }
  // Сорвавшуюся заливку отличает причина: упавший /send диспатчит message.failed без неё.
  if (sendStatus === 'failed' && upload.error !== undefined) {
    return { status: 'uploadFailed', retryable: isRetryableFailure(upload.error) }
  }
  return null
}
