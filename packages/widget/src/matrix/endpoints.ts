import { createEndpoints } from '../shared/createEndpoints'

const MATRIX_CLIENT_V3 = '/_matrix/client/v3'
const MATRIX_MEDIA_V3 = '/_matrix/media/v3'

export const Endpoints = createEndpoints({
  REGISTER: `${MATRIX_CLIENT_V3}/register`,
  REFRESH: `${MATRIX_CLIENT_V3}/refresh`,
  SYNC: `${MATRIX_CLIENT_V3}/sync`,
  LOAD_HISTORY: `${MATRIX_CLIENT_V3}/rooms/{roomId}/messages`,
  SEND_MESSAGE: `${MATRIX_CLIENT_V3}/rooms/{roomId}/send/m.room.message/{txnId}`,
  MARK_READ: `${MATRIX_CLIENT_V3}/rooms/{roomId}/receipt/m.read/{eventId}`,
  UPLOAD_MEDIA: `${MATRIX_MEDIA_V3}/upload`,
} as const)
