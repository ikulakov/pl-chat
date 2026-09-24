import type { UploadFailure } from '@/domain/mediaFailure'
import type { MediaTimelineItem } from '@/domain/timeline'

/**
 * Состояние своей отдачи байт, общее для картинки и файла: рисуют они его по-разному
 * (оверлей на кадре против строки в чипе), а выводится оно из сообщения одинаково.
 */
export interface MediaUploadView {
  /**
   * Проценты идущей прямо сейчас заливки; null — байты не льются (не начиналась, уже
   * загрузились или сорвались). Одним полем, а не парой с флагом: раздельные поля теряют
   * связь при деструктуризации, и каждому потребителю пришлось бы снова проверять null.
   */
  uploadPct: number | null
  // причина сорвавшейся заливки; undefined — не падала
  failure: UploadFailure | undefined
  uploadFailed: boolean
  // время и статус не показываем — о судьбе сообщения говорит само вложение
  isMetaHidden: boolean
}

export function getMediaUploadView(item: MediaTimelineItem): MediaUploadView {
  // upload есть только у своего черновика; pct null — загрузка не идёт (упала)
  const pct = item.upload?.pct ?? null
  const uploadPct = pct !== null && item.sendStatus === 'sending' ? pct : null

  // Сорвавшуюся отдачу байт опознаём по причине, а не по наличию upload: падение самого
  // /send диспатчит message.failed без поля upload, и причина остаётся пустой.
  const failure = item.sendStatus === 'failed' ? item.upload?.error : undefined
  const uploadFailed = failure !== undefined

  return {
    uploadPct,
    failure,
    uploadFailed,
    // Заливка и её сбой уже показаны на самом вложении (кольцо прогресса, рамка и действие у
    // картинки; текст и действие у чипа). Время со статусом рядом читалось бы вторым сообщением
    // о том же, а крестик статуса — как другая ошибка. По макету их нет вовсе.
    isMetaHidden: uploadPct !== null || uploadFailed,
  }
}
