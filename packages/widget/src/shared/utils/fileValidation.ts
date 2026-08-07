import { t } from '../../i18n'

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

export const ALLOWED_EXTENSIONS = Object.keys(MIME_BY_EXTENSION)

/** Лимита размера файла (10 МБ) */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

/** Значение атрибута accept для <input type=file> */
export const FILE_ACCEPT = ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(',')

export type FileValidation = { ok: true } | { ok: false; message: string }

export function getFileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : ''
}

export function resolveMimeType(file: File): string {
  return MIME_BY_EXTENSION[getFileExtension(file.name)] ?? (file.type || 'application/octet-stream')
}

export function validateFile(file: File, maxBytes = MAX_FILE_SIZE_BYTES): FileValidation {
  const ext = getFileExtension(file.name)

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return { ok: false, message: t('composer.upload.badType') }
  }
  if (file.size > maxBytes) {
    return { ok: false, message: t('composer.upload.tooLarge') }
  }
  return { ok: true }
}

const PREVIEWABLE_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif'])

/** `image/*`-расширения для инлайн-превью (raster, которые браузер рендерит в <img>). */
export function isPreviewableImage(file: File): boolean {
  return PREVIEWABLE_IMAGE_EXTENSIONS.has(getFileExtension(file.name))
}
