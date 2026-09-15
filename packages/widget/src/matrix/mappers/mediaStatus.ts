import type { MediaVerdictEntry } from '../../domain/mediaVerdict'
import { isMediaStatusEvent } from '../wire/guards'
import type * as Matrix from '../wire/types'

export function collectMediaVerdicts(events: Matrix.ClientEvent[] = []): MediaVerdictEntry[] {
  return events.filter(isMediaStatusEvent).map(({ content: { media_id, status } }) => ({
    mediaId: media_id,
    verdict: { status },
  }))
}
