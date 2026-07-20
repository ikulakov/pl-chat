import { describe, expect, it } from 'vitest'
import { textItem } from '../shared/testUtils/matrixFixtures'
import { mergeTimeline, prependTimeline } from './mergeTimeline'

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

  it('sync-race: черновик резолвится по совпавшему txnId, без дубля', () => {
    const pending = {
      ...base,
      eventId: 'optimistic:uuid',
      txnId: 'txn-1',
      sendStatus: 'sending' as const,
    }
    const fromSync = { ...base, eventId: '$real', txnId: 'txn-1', ts: 150 }

    const result = mergeTimeline([pending], [fromSync])

    expect(result).toHaveLength(1)
    expect(result[0]!.eventId).toBe('$real')
    expect(result[0]).toMatchObject({ sendStatus: 'sent' })
  })

  it('sync-race: два черновика с одинаковым телом резолвятся по своему txnId, не по FIFO', () => {
    const first = {
      ...base,
      localId: 'local-1',
      eventId: 'optimistic:1',
      txnId: 'txn-1',
      sendStatus: 'sending' as const,
    }
    const second = {
      ...base,
      localId: 'local-2',
      eventId: 'optimistic:2',
      txnId: 'txn-2',
      sendStatus: 'sending' as const,
      ts: 101,
    }
    // echo принадлежит ВТОРОЙ отправке — раньше (по эвристике sender+body) достался бы первому
    // черновику; точный txnId это больше не путает.
    const fromSync = { ...base, eventId: '$real', txnId: 'txn-2', ts: 150 }

    const result = mergeTimeline([first, second], [fromSync])

    expect(result).toHaveLength(2)
    expect(result.find((message) => message.eventId === '$real')?.localId).toBe('local-2')
    expect(result.find((message) => message.localId === 'local-1')).toMatchObject({
      sendStatus: 'sending',
    })
  })

  it('sync-race: echo без transaction_id (чужой отправитель) не резолвит черновик, а добавляется отдельно', () => {
    // unsigned.transaction_id виден только отправившей паре (user, device) — если он отсутствует,
    // событие не может быть эхом НАШЕГО черновика, даже при совпавшем теле.
    const pending = {
      ...base,
      eventId: 'optimistic:uuid',
      txnId: 'txn-1',
      sendStatus: 'sending' as const,
    }
    const fromSync = { ...base, eventId: '$real', ts: 150 }

    const result = mergeTimeline([pending], [fromSync])

    expect(result).toHaveLength(2)
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
    const failed = {
      ...base,
      eventId: 'optimistic:uuid',
      txnId: 'txn-1',
      sendStatus: 'failed' as const,
    }
    const fromSync = { ...base, eventId: '$real', txnId: 'txn-1', ts: 150 }

    const result = mergeTimeline([failed], [fromSync])

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ eventId: '$real', sendStatus: 'sent' })
  })

  it('echo достаётся черновику со своим txnId, а не проваленному с чужим', () => {
    // одинаковый текст: одна отправка провалилась, вторая в полёте. echo принадлежит второй по txnId.
    const failed = {
      ...base,
      localId: 'l1',
      eventId: 'optimistic:1',
      txnId: 'txn-1',
      sendStatus: 'failed' as const,
    }
    const sending = {
      ...base,
      localId: 'l2',
      eventId: 'optimistic:2',
      txnId: 'txn-2',
      sendStatus: 'sending' as const,
    }
    const fromSync = { ...base, eventId: '$real', txnId: 'txn-2', ts: 150 }

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

describe('prependTimeline — подгрузка истории вверх', () => {
  const older = textItem({ localId: '$old', eventId: '$old', body: 'старое', ts: 1 })

  it('кладёт историю ПЕРЕД лентой, сохраняя порядок страницы', () => {
    const second = { ...older, localId: '$old2', eventId: '$old2', ts: 2 }

    const result = prependTimeline([base], [older, second])

    expect(result.map((item) => item.eventId)).toEqual(['$old', '$old2', '$a'])
  })

  it('дедуплицирует пересечение страницы с тем, что уже приехало через sync', () => {
    // сервер отдаёт страницу по stream-курсору, она может захватить уже показанные события
    const result = prependTimeline([base], [older, base])

    expect(result.map((item) => item.eventId)).toEqual(['$old', '$a'])
  })

  it('не склеивает историю с optimistic-черновиком, даже если совпали sender и body', () => {
    // в отличие от mergeTimeline: в истории черновиков быть не может, совпадение текста — случайность
    const draft = { ...base, eventId: 'optimistic:uuid', sendStatus: 'sending' as const }
    const fromHistory = { ...base, localId: '$hist', eventId: '$hist', ts: 1 }

    const result = prependTimeline([draft], [fromHistory])

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ eventId: '$hist' })
    expect(result[1]).toMatchObject({ eventId: 'optimistic:uuid', sendStatus: 'sending' })
  })

  it('возвращает ту же ссылку, когда новых событий не осталось', () => {
    // холостая страница (все события уже в ленте) не должна перерисовывать весь список
    const existing = [base]

    expect(prependTimeline(existing, [])).toBe(existing)
    expect(prependTimeline(existing, [base])).toBe(existing)
  })
})
