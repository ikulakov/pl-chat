import { createEndpoints } from '../../shared/utils/createEndpoints'

const MATRIX_CLIENT = '/_matrix/client'
const MATRIX_MEDIA = '/_matrix/media'
// KC-расширения живут под vendor-prefix'ом по матричной конвенции: каталоги эмодзи и стикеров
// не входят в спеку C-S API.
const KC_UNSTABLE = `${MATRIX_CLIENT}/unstable/ru.otpbank.kc`

export const Endpoints = createEndpoints({
  REGISTER: `${MATRIX_CLIENT}/v3/register`,
  REFRESH: `${MATRIX_CLIENT}/v3/refresh`,
  SYNC: `${MATRIX_CLIENT}/v3/sync`,
  LOAD_HISTORY: `${MATRIX_CLIENT}/v3/rooms/{roomId}/messages`,
  // Тип события параметром: кроме m.room.message тем же маршрутом уходит m.sticker.
  // createEndpoints кодирует параметры через encodeURIComponent, точка не экранируется.
  SEND_EVENT: `${MATRIX_CLIENT}/v3/rooms/{roomId}/send/{eventType}/{txnId}`,
  SEND_REACTION: `${MATRIX_CLIENT}/v3/rooms/{roomId}/send/m.reaction/{txnId}`,
  SEND_REDACTION: `${MATRIX_CLIENT}/v3/rooms/{roomId}/send/m.room.redaction/{txnId}`,
  MARK_READ: `${MATRIX_CLIENT}/v3/rooms/{roomId}/receipt/m.read/{eventId}`,
  UPLOAD_MEDIA: `${MATRIX_MEDIA}/v3/upload`,
  DOWNLOAD_MEDIA: `${MATRIX_CLIENT}/v1/media/download/{serverName}/{mediaId}`,
  THUMBNAIL_MEDIA: `${MATRIX_CLIENT}/v1/media/thumbnail/{serverName}/{mediaId}`,

  // Каталоги — с токеном; байты (EMOJI_LOTTIE, STICKER_BYTES) отдаются permitAll и кешируются
  // на неделю как immutable, поэтому к эмодзи обязателен ?v={version} из каталога.
  EMOJI_CATEGORIES: `${KC_UNSTABLE}/emoji/v1/categories`,
  EMOJI_CATEGORY: `${KC_UNSTABLE}/emoji/v1/categories/{categoryId}`,
  // Весь пак разом, без силуэтов: по нему лента ищет эмодзи в тексте сообщения.
  EMOJI_PACKS: `${KC_UNSTABLE}/emoji/v1/packs`,
  EMOJI_LOTTIE: `/_matrix/emoji/{codepoint}`,
  STICKER_PACKS: `${KC_UNSTABLE}/stickers/v1/packs`,
  STICKER_BYTES: `/_matrix/sticker/{mediaId}`,
} as const)
