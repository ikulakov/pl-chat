import type { MediaVerdictEntry } from '../../domain/mediaVerdict'
import { MediaScanStatus } from '../wire/consts'
import { isMediaStatusEvent } from '../wire/guards'
import type * as Matrix from '../wire/types'

export function toMediaVerdictEntry(event: Matrix.ClientEvent): MediaVerdictEntry | undefined {
  if (!isMediaStatusEvent(event)) return

  const { media_id: mediaId, status, error } = event.content
  if (!mediaId) return

  return {
    mediaId,
    verdict:
      status === MediaScanStatus.Rejected
        ? { status: 'rejected', ...(error ? { error } : {}) }
        : { status: 'ready' },
  }
}

export function collectMediaVerdicts(events: Matrix.ClientEvent[] = []): MediaVerdictEntry[] {
  const result: MediaVerdictEntry[] = []

  for (const event of events) {
    const entry = toMediaVerdictEntry(event)
    if (entry) result.push(entry)
  }

  return result
}
