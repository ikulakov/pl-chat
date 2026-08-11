import { describe, expect, it } from 'vitest'
import {
  MEDIA_REJECT_REASON,
  mediaStatusEvent,
  roomMessageEvent,
} from '../../shared/testUtils/matrixFixtures'
import { collectMediaVerdicts } from './mediaStatus'

describe('collectMediaVerdicts', () => {
  it('извлекает rejected-вердикт с текстом ошибки', () => {
    const entries = collectMediaVerdicts([mediaStatusEvent({ media_id: 'abc' })])

    expect(entries).toEqual([
      { mediaId: 'abc', verdict: { status: 'rejected', error: MEDIA_REJECT_REASON } },
    ])
  })

  it('извлекает ready-вердикт без поля error', () => {
    const entries = collectMediaVerdicts([mediaStatusEvent({ media_id: 'abc', status: 'ready' })])

    expect(entries).toEqual([{ mediaId: 'abc', verdict: { status: 'ready' } }])
  })

  it('игнорирует прочие типы событий', () => {
    expect(collectMediaVerdicts([roomMessageEvent()])).toEqual([])
  })
})
