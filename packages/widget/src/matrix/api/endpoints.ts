import { createEndpoints } from '../../shared/utils/createEndpoints'

const MATRIX_CLIENT = '/_matrix/client'
const MATRIX_MEDIA = '/_matrix/media'

export const Endpoints = createEndpoints({
  REGISTER: `${MATRIX_CLIENT}/v3/register`,
  REFRESH: `${MATRIX_CLIENT}/v3/refresh`,
  SYNC: `${MATRIX_CLIENT}/v3/sync`,
  LOAD_HISTORY: `${MATRIX_CLIENT}/v3/rooms/{roomId}/messages`,
  SEND_MESSAGE: `${MATRIX_CLIENT}/v3/rooms/{roomId}/send/m.room.message/{txnId}`,
  MARK_READ: `${MATRIX_CLIENT}/v3/rooms/{roomId}/receipt/m.read/{eventId}`,
  UPLOAD_MEDIA: `${MATRIX_MEDIA}/v3/upload`,
  DOWNLOAD_MEDIA: `${MATRIX_CLIENT}/v1/media/download/{serverName}/{mediaId}`,
  THUMBNAIL_MEDIA: `${MATRIX_CLIENT}/v1/media/thumbnail/{serverName}/{mediaId}`,
  EMOJI_PACKS: `${MATRIX_CLIENT}/unstable/ru.otpbank.kc/emoji/v1/packs`,
  // Байты анимации: server-managed каталог, один ответ на всех, отдаётся без токена.
  EMOJI_LOTTIE: `/_matrix/emoji/{codepoint}`,
} as const)
