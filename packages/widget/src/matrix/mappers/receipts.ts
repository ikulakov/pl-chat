import type { ReadMarker } from '../../domain/receipts'
import { ReceiptType } from '../wire/consts'
import { isReceiptEvent } from '../wire/guards'
import type * as Matrix from '../wire/types'

/**
 * Разворачивает m.receipt в плоский список маркеров userId → eventId.
 */
export function toReadMarkers(events: Matrix.EphemeralEvent[] = []): ReadMarker[] {
  const markers: ReadMarker[] = []

  for (const event of events) {
    if (!isReceiptEvent(event)) continue

    for (const [eventId, byType] of Object.entries(event.content)) {
      const readers = byType[ReceiptType.Read]
      if (!readers) continue

      for (const userId of Object.keys(readers)) {
        markers.push({ userId, eventId })
      }
    }
  }

  return markers
}
