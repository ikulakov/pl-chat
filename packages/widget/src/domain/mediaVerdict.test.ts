import { describe, expect, it } from 'vitest'
import { applyMediaVerdicts, findOwnMedia, pickFirstRejected } from './mediaVerdict'
import type { TimelineItem } from './timeline'

describe('mergeMediaVerdicts', () => {
  it('добавляет новые вердикты по mediaId', () => {
    const result = applyMediaVerdicts({}, [
      { mediaId: 'm1', verdict: { status: 'ready' } },
      { mediaId: 'm2', verdict: { status: 'rejected' } },
    ])

    expect(result).toEqual({
      m1: { status: 'ready' },
      m2: { status: 'rejected' },
    })
  })

  it('не перезаписывает уже известный вердикт — он терминален', () => {
    const existing = { m1: { status: 'ready' as const } }

    const result = applyMediaVerdicts(existing, [
      { mediaId: 'm1', verdict: { status: 'rejected' } },
    ])

    expect(result).toBe(existing)
  })

  it('пустой список входящих не создаёт новый объект', () => {
    const existing = {}

    expect(applyMediaVerdicts(existing, [])).toBe(existing)
  })
})

describe('pickFirstRejected', () => {
  it('повтор уже известного вердикта не считается новым', () => {
    // тот же mediaId приезжает ещё раз со страницей истории — уведомлять второй раз незачем
    const known = { m1: { status: 'rejected' as const } }

    expect(
      pickFirstRejected(known, known, [{ mediaId: 'm1', verdict: { status: 'rejected' } }]),
    ).toEqual([])
  })

  it('дубль внутри одного батча даёт один mediaId', () => {
    const incoming = [
      { mediaId: 'm1', verdict: { status: 'rejected' as const } },
      { mediaId: 'm1', verdict: { status: 'rejected' as const } },
    ]

    expect(pickFirstRejected({}, applyMediaVerdicts({}, incoming), incoming)).toEqual(['m1'])
  })

  it('пропускает вердикты ready', () => {
    const incoming = [
      { mediaId: 'm1', verdict: { status: 'ready' as const } },
      { mediaId: 'm2', verdict: { status: 'rejected' as const } },
    ]

    expect(pickFirstRejected({}, applyMediaVerdicts({}, incoming), incoming)).toEqual(['m2'])
  })
})

describe('findOwnMedia', () => {
  const mediaItem = (sender: string, url: string): TimelineItem => ({
    kind: 'file',
    localId: `local-${url}`,
    eventId: `event-${url}`,
    sender,
    ts: 0,
    sendStatus: 'sent',
    content: {
      body: 'doc.pdf',
      url,
      filename: 'doc.pdf',
      info: { mimetype: 'application/pdf', size: 10 },
    },
  })

  const timeline = [
    mediaItem('@me:bank.ru', 'mxc://bank.ru/mine'),
    mediaItem('@operator:bank.ru', 'mxc://bank.ru/theirs'),
  ]

  it('узнаёт свой файл по mediaId из mxc-ссылки', () => {
    expect(findOwnMedia(timeline, ['mine'], '@me:bank.ru')?.localId).toBe(
      'local-mxc://bank.ru/mine',
    )
  })

  it('файл оператора своим не считает', () => {
    expect(findOwnMedia(timeline, ['theirs'], '@me:bank.ru')).toBeUndefined()
  })

  it('черновик вложения без url не совпадает даже с пустым mediaId', () => {
    const draft = mediaItem('@me:bank.ru', '')

    expect(findOwnMedia([draft], [''], '@me:bank.ru')).toBeUndefined()
  })

  it('из нескольких вердиктов берёт первый свой файл в ленте', () => {
    expect(findOwnMedia(timeline, ['theirs', 'mine'], '@me:bank.ru')?.localId).toBe(
      'local-mxc://bank.ru/mine',
    )
  })
})
