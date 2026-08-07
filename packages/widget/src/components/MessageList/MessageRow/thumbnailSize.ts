import type { ThumbnailSize } from '../../../matrix/api/matrixApi'

const STANDARD: ThumbnailSize = { width: 320, height: 240 }
const RETINA: ThumbnailSize = { width: 640, height: 480 }

/**
 * Сервер отдаёт ближайшее из заранее сгенерированных превью (320×240, 640×480, 800×600),
 * поэтому своя дробная шкала размеров ничего не даёт — достаточно двух ступеней по DPR.
 * Обе накрывают бокс MEDIA_BOX (184×172, на retina — 368×344).
 * Меньше ступеней — меньше ключей кэша и повторных запросов на одну картинку.
 */
export function pickThumbnailSize(): ThumbnailSize {
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  return dpr > 1.5 ? RETINA : STANDARD
}
