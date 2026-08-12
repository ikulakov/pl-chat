import { describe, expect, it } from 'vitest'
import { mediaStatusEvent, roomMessageEvent } from '../../shared/testUtils/matrixFixtures'
import { collectMediaVerdicts } from './mediaStatus'

describe('collectMediaVerdicts', () => {
  it('извлекает rejected-вердикт без причины отказа', () => {
    const entries = collectMediaVerdicts([mediaStatusEvent({ media_id: 'abc' })])

    expect(entries).toEqual([{ mediaId: 'abc', verdict: { status: 'rejected' } }])
  })

  it('сопоставляет по media_id, а не по content.event_id', () => {
    const event = mediaStatusEvent({ media_id: 'abc', event_id: '$other' })

    expect(collectMediaVerdicts([event])).toEqual([
      { mediaId: 'abc', verdict: { status: 'rejected' } },
    ])
  })

  it('извлекает ready-вердикт', () => {
    const entries = collectMediaVerdicts([mediaStatusEvent({ media_id: 'abc', status: 'ready' })])

    expect(entries).toEqual([{ mediaId: 'abc', verdict: { status: 'ready' } }])
  })

  it('игнорирует прочие типы событий', () => {
    expect(collectMediaVerdicts([roomMessageEvent()])).toEqual([])
  })
})
