import { MsgType } from '../shared/matrixConst'
import type { RegisterResponse, SyncResponse } from '../types/requests'
import { request } from './httpClient'

export const matrixApi = {
  registerGuest(): Promise<RegisterResponse> {
    return request<RegisterResponse>('/register?kind=guest', {
      method: 'POST',
      body: JSON.stringify({}),
    })
  },

  initialSync(): Promise<SyncResponse> {
    return request<SyncResponse>('/sync?timeout=0')
  },

  longPollSync(
    since: string,
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<SyncResponse> {
    const params = new URLSearchParams({
      timeout: String(options?.timeoutMs ?? 25_000),
      since,
    })
    return request<SyncResponse>(`/sync?${params}`, { signal: options?.signal ?? null })
  },

  sendMessage(roomId: string, txnId: string, body: string): Promise<{ event_id: string }> {
    return request<{ event_id: string }>(
      `/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
      {
        method: 'PUT',
        body: JSON.stringify({ msgtype: MsgType.Text, body }),
      },
    )
  },
}
