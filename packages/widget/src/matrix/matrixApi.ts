import type { RegisterResponse, SyncResponse } from './dto'
import { MATRIX_API_PREFIX, MsgType } from './consts'
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

    sendMessage(roomId: string, txnId: string, body: string): Promise<{ event_id: string }> {
      return transport.request<{ event_id: string }>(
        `${MATRIX_API_PREFIX}/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
        {
          method: 'PUT',
          body: JSON.stringify({ msgtype: MsgType.Text, body }),
        },
      )
    },
  }
}

export type MatrixApi = ReturnType<typeof createMatrixApi>
