import { HISTORY_PAGE_SIZE, MATRIX_API_PREFIX, MsgType, ReceiptType } from './consts'
import type { MessagesResponse, RegisterResponse, SyncResponse } from './dto'
import type { MatrixTransport } from './transport/matrixTransport'

export function createMatrixApi(transport: MatrixTransport) {
  return {
    registerGuest(): Promise<RegisterResponse> {
      return transport.request<RegisterResponse>(`${MATRIX_API_PREFIX}/register?kind=guest`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
    },

    initialSync(): Promise<SyncResponse> {
      return transport.request<SyncResponse>(`${MATRIX_API_PREFIX}/sync?timeout=0`)
    },

    longPollSync(
      since: string,
      options?: { signal?: AbortSignal | null; timeoutMs?: number },
    ): Promise<SyncResponse> {
      const params = new URLSearchParams({
        timeout: String(options?.timeoutMs ?? 25_000),
        since,
      })
      return transport.request<SyncResponse>(`${MATRIX_API_PREFIX}/sync?${params}`, {
        signal: options?.signal ?? null,
      })
    },

    getRoomHistory(roomId: string, from: string, signal?: AbortSignal): Promise<MessagesResponse> {
      const params = new URLSearchParams({
        dir: 'b',
        from,
        limit: String(HISTORY_PAGE_SIZE),
      })
      return transport.request<MessagesResponse>(
        `${MATRIX_API_PREFIX}/rooms/${encodeURIComponent(roomId)}/messages?${params}`,
        { signal: signal ?? null },
      )
    },

    sendMessage(params: {
      txnId: string
      roomId: string
      body: string
      replyToEventId?: string
    }): Promise<{ event_id: string }> {
      const { roomId, txnId, body, replyToEventId } = params

      return transport.request<{ event_id: string }>(
        `${MATRIX_API_PREFIX}/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            msgtype: MsgType.Text,
            body,
            // reply по спеке — только m.relates_to; rich-reply фоллбек в body не пишем
            ...(replyToEventId
              ? { 'm.relates_to': { 'm.in_reply_to': { event_id: replyToEventId } } }
              : {}),
          }),
        },
      )
    },

    sendReadReceipt(roomId: string, eventId: string): Promise<Record<string, never>> {
      return transport.request<Record<string, never>>(
        `${MATRIX_API_PREFIX}/rooms/${encodeURIComponent(roomId)}/receipt/${ReceiptType.Read}/${encodeURIComponent(eventId)}`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        },
      )
    },
  }
}

export type MatrixApi = ReturnType<typeof createMatrixApi>
