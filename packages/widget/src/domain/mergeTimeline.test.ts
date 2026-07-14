import { describe, expect, it } from 'vitest'
import { textItem } from '../shared/testUtils/matrixFixtures'
import { mergeTimeline } from './mergeTimeline'

const base = textItem({ localId: '$a', eventId: '$a', sender: '@op:bank.ru', body: 'hi', ts: 100 })

describe('mergeTimeline — deduplication invariants', () => {
  it('appends message with unknown eventId', () => {
    const incoming = { ...base, localId: '$b', eventId: '$b', ts: 200 }

    const result = mergeTimeline([base], [incoming])

    expect(result).toHaveLength(2)
  })

  it('deduplicates: same eventId not added twice', () => {
    const result = mergeTimeline([base], [base])

    expect(result).toHaveLength(1)
  })

  it('sync-race: sending message with matching sender+body resolved, no duplicate', () => {
    const pending = { ...base, eventId: 'optimistic:uuid', sendStatus: 'sending' as const }
    const fromSync = { ...base, eventId: '$real', ts: 150 }

    const result = mergeTimeline([pending], [fromSync])

    expect(result).toHaveLength(1)
    expect(result[0]!.eventId).toBe('$real')
    expect(result[0]).toMatchObject({ sendStatus: 'sent' })
  })

  it('sync-race: duplicate sending messages with the same body resolve only one draft', () => {
    const first = {
      ...base,
      localId: 'local-1',
      eventId: 'optimistic:1',
      sendStatus: 'sending' as const,
    }
    const second = {
      ...base,
      localId: 'local-2',
      eventId: 'optimistic:2',
      sendStatus: 'sending' as const,
      ts: 101,
    }
    const fromSync = { ...base, eventId: '$real', ts: 150 }

    const result = mergeTimeline([first, second], [fromSync])

    expect(result).toHaveLength(2)
    expect(result.filter((message) => message.eventId === '$real')).toHaveLength(1)
    expect(
      result.filter((message) => 'sendStatus' in message && message.sendStatus === 'sending'),
    ).toHaveLength(1)
  })

  it('sync-race: при одинаковом теле реальный event достаётся ПЕРВОМУ черновику (known txnId-less gap)', () => {
    const first = {
      ...base,
      localId: 'local-1',
      eventId: 'optimistic:1',
      sendStatus: 'sending' as const,
      ts: 100,
    }
    const second = {
      ...base,
      localId: 'local-2',
      eventId: 'optimistic:2',
      sendStatus: 'sending' as const,
      ts: 101,
    }
    const fromSync = { ...base, eventId: '$real', ts: 150 }

    const result = mergeTimeline([first, second], [fromSync])

    expect(result.find((message) => message.eventId === '$real')?.localId).toBe('local-1')
  })

  it('PUT-first: серверный ts из sync вытесняет клиентский у уже отправленного сообщения', () => {
    // PUT /send зарезолвил черновик раньше sync: реальный eventId, но клиентский ts.
    const sent = { ...base, eventId: '$real', ts: 999, sendStatus: 'sent' as const }
    const fromSync = { ...base, eventId: '$real', ts: 150 }

    const result = mergeTimeline([sent], [fromSync])

    expect(result).toHaveLength(1)
    expect(result[0]!.ts).toBe(150)
    expect(result[0]).toMatchObject({ sendStatus: 'sent', eventId: '$real' })
  })

  it('PUT-first: повторный sync с тем же ts не меняет ссылку на массив', () => {
    // серверный ts уже подтянут — идемпотентный тик не должен триггерить ре-рендер
    const reconciled = [{ ...base, eventId: '$real', ts: 150, sendStatus: 'sent' as const }]

    expect(mergeTimeline(reconciled, [{ ...base, eventId: '$real', ts: 150 }])).toBe(reconciled)
  })

  it('echo резолвит failed-черновик, а не показывает сообщение вторым', () => {
    // PUT отвалился по таймауту УЖЕ ПОСЛЕ того, как сервер событие принял: eventId мы не узнали,
    // черновик помечен failed. Раз echo пришёл — событие в комнате. Раньше здесь появлялся
    // дубль: проваленный черновик с кнопкой «повторить» рядом с доставленной копией.
    const failed = { ...base, eventId: 'optimistic:uuid', sendStatus: 'failed' as const }
    const fromSync = { ...base, eventId: '$real', ts: 150 }

    const result = mergeTimeline([failed], [fromSync])

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ eventId: '$real', sendStatus: 'sent' })
  })

  it('echo достаётся живому черновику, а не проваленному — FIFO не ломается', () => {
    // одинаковый текст: одна отправка провалилась, вторая в полёте. echo принадлежит второй.
    const failed = {
      ...base,
      localId: 'l1',
      eventId: 'optimistic:1',
      sendStatus: 'failed' as const,
    }
    const sending = {
      ...base,
      localId: 'l2',
      eventId: 'optimistic:2',
      sendStatus: 'sending' as const,
    }
    const fromSync = { ...base, eventId: '$real', ts: 150 }

    const result = mergeTimeline([failed, sending], [fromSync])

    expect(result).toHaveLength(2)
    expect(result.find((m) => m.eventId === '$real')?.localId).toBe('l2')
    expect(result.find((m) => m.localId === 'l1')).toMatchObject({ sendStatus: 'failed' })
  })

  it('returns the same array reference when nothing actually changes (empty or fully-duplicate incoming)', () => {
    // критично для React: пустой тик sync-петли не должен менять ссылку на messages
    const existing = [base]

    expect(mergeTimeline(existing, [])).toBe(existing)
    expect(mergeTimeline(existing, [base])).toBe(existing)
  })
})
