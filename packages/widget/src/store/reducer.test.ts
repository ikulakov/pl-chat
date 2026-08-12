import { describe, expect, it } from 'vitest'
import { fileItem, OPERATOR_ID, textItem } from '../shared/testUtils/matrixFixtures'
import type { RoomSyncPatch } from '../domain/roomSync'
import type { TextTimelineItem } from '../domain/timeline'
import { chatRuntimeReducer } from './reducer'
import type { ChatRuntimeState, Identity } from './state'
import { INITIAL_RUNTIME_STATE } from './store'

const IDENTITY: Identity = { userId: '@user:bank', roomId: '!room:bank' }
const OPERATOR = '@operator:bank'

// connected-состояние с одним своим доставленным ('sent') сообщением $real в таймлайне
function connectedWithSentMessage(): ChatRuntimeState {
  return {
    ...INITIAL_RUNTIME_STATE,
    phase: 'connected',
    identity: IDENTITY,
    cursor: 's1',
    room: {
      ...INITIAL_RUNTIME_STATE.room,
      timeline: [
        textItem({
          localId: 'l1',
          eventId: '$real',
          sender: IDENTITY.userId,
          body: 'hi',
          ts: 1,
          sendStatus: 'sent',
        }),
      ],
    },
  }
}

function roomPatch(overrides: Partial<RoomSyncPatch> = {}): RoomSyncPatch {
  return {
    timeline: [],
    readMarkers: [],
    reactions: [],
    cardAnswers: [],
    mediaVerdicts: [],
    prevBatch: null,
    ...overrides,
  }
}

// снимок «как при старте комнаты»: одно сообщение, активный оператор, курсор истории
function initialPatch(): RoomSyncPatch {
  return roomPatch({
    timeline: [textItem({ localId: '$m1', eventId: '$m1' })],
    operator: { isActive: true, id: OPERATOR_ID, displayName: 'Support' },
    prevBatch: 'p1',
  })
}

function ownMessage(
  overrides: Partial<Omit<TextTimelineItem, 'kind' | 'content'>> & { body?: string } = {},
): TextTimelineItem {
  return textItem({
    localId: 'l1',
    eventId: 'optimistic:l1',
    sender: IDENTITY.userId,
    body: 'hi',
    ts: 1,
    sendStatus: 'sending',
    ...overrides,
  })
}

describe('chatRuntimeReducer', () => {
  it('starts a session and applies the initial room snapshot (messages + operator)', () => {
    const next = chatRuntimeReducer(INITIAL_RUNTIME_STATE, {
      type: 'session.started',
      identity: IDENTITY,
      cursor: 's1',
      room: initialPatch(),
    })

    expect(next.phase).toBe('connected')
    expect(next.identity).toEqual(IDENTITY)
    expect(next.cursor).toBe('s1')
    expect(next.room.timeline).toHaveLength(1)
    expect(next.room.operator).toEqual({ isActive: true, id: OPERATOR_ID, displayName: 'Support' })
  })

  it('resets room state when a new session starts in a different room', () => {
    const connected = chatRuntimeReducer(INITIAL_RUNTIME_STATE, {
      type: 'session.started',
      identity: IDENTITY,
      cursor: 's1',
      room: initialPatch(),
    })
    const withDraft = chatRuntimeReducer(connected, {
      type: 'message.optimisticAdded',
      message: ownMessage({ body: 'old draft', ts: 2 }),
    })

    const next = chatRuntimeReducer(withDraft, {
      type: 'session.started',
      identity: { userId: '@new:bank', roomId: '!new:bank' },
      cursor: 's2',
      room: roomPatch({
        timeline: [
          textItem({ localId: '$new', eventId: '$new', body: 'new session message', ts: 3 }),
        ],
      }),
    })

    expect(next.room.timeline).toMatchObject([{ content: { body: 'new session message' } }])
  })

  it('цель ответа переживает re-auth в ту же комнату и сбрасывается при новой', () => {
    // ровно тот инвариант, ради которого replyTarget лежит в RoomState, а не рядом с isOpen
    const connected = chatRuntimeReducer(INITIAL_RUNTIME_STATE, {
      type: 'session.started',
      identity: IDENTITY,
      cursor: 's1',
      room: initialPatch(),
    })
    const withTarget = chatRuntimeReducer(connected, {
      type: 'reply.targeted',
      target: { eventId: '$parent', sender: OPERATOR, body: 'исходное' },
    })

    const sameRoom = chatRuntimeReducer(withTarget, {
      type: 'session.started',
      identity: IDENTITY,
      cursor: 's2',
      room: roomPatch(),
    })
    const newRoom = chatRuntimeReducer(withTarget, {
      type: 'session.started',
      identity: { userId: '@new:bank', roomId: '!new:bank' },
      cursor: 's2',
      room: roomPatch(),
    })

    expect(sameRoom.room.replyTarget).toEqual({
      eventId: '$parent',
      sender: OPERATOR,
      body: 'исходное',
    })
    expect(newRoom.room.replyTarget).toBeNull()
  })

  it('sync.received WITHOUT a roomAction keeps the same room reference', () => {
    const connected = chatRuntimeReducer(INITIAL_RUNTIME_STATE, {
      type: 'session.started',
      identity: IDENTITY,
      cursor: 's1',
      room: initialPatch(),
    })

    const synced = chatRuntimeReducer(connected, { type: 'sync.received', cursor: 's2' })

    expect(synced.cursor).toBe('s2')
    expect(synced.room).toBe(connected.room)
  })

  it('connection.failed resets identity, cursor and room', () => {
    const connected = chatRuntimeReducer(INITIAL_RUNTIME_STATE, {
      type: 'session.started',
      identity: IDENTITY,
      cursor: 's1',
      room: initialPatch(),
    })

    const failed = chatRuntimeReducer(connected, { type: 'connection.failed', error: 'network' })

    expect(failed.phase).toBe('error')
    expect(failed.error).toBe('network')
    expect(failed.identity).toBeNull()
    expect(failed.cursor).toBeNull()
    expect(failed.room.timeline).toHaveLength(0)
  })

  it('session.closed возвращает рантайм в исходное состояние', () => {
    const connected = chatRuntimeReducer(INITIAL_RUNTIME_STATE, {
      type: 'session.started',
      identity: IDENTITY,
      cursor: 's1',
      room: initialPatch(),
    })

    const closed = chatRuntimeReducer(connected, { type: 'session.closed' })

    expect(closed).toEqual(INITIAL_RUNTIME_STATE)
  })

  it('session.recovering keeps the current runtime data while recovery is in flight', () => {
    const connected = chatRuntimeReducer(INITIAL_RUNTIME_STATE, {
      type: 'session.started',
      identity: IDENTITY,
      cursor: 's1',
      room: initialPatch(),
    })
    const withError = { ...connected, error: 'expired' }

    const recovering = chatRuntimeReducer(withError, { type: 'session.recovering' })

    expect(recovering.phase).toBe('recovering')
    expect(recovering.error).toBeNull()
    expect(recovering.identity).toEqual(IDENTITY)
    expect(recovering.cursor).toBe('s1')
    expect(recovering.room).toBe(connected.room)
  })

  it('ответ PUT резолвит черновик: реальный eventId + «отправлено»', () => {
    // 200 от /send по Matrix-спеке = «событие отправлено», как в Element (EventStatus.SENT
    // ставится по HTTP-ответу, не по echo).
    const withOptimistic = chatRuntimeReducer(
      { ...INITIAL_RUNTIME_STATE, identity: IDENTITY },
      { type: 'message.optimisticAdded', message: ownMessage({}) },
    )
    expect(withOptimistic.room.timeline[0]).toMatchObject({ sendStatus: 'sending' })

    const resolved = chatRuntimeReducer(withOptimistic, {
      type: 'message.sent',
      localId: 'l1',
      eventId: '$real',
    })

    expect(resolved.room.timeline[0]!.eventId).toBe('$real')
    expect(resolved.room.timeline[0]).toMatchObject({ sendStatus: 'sent' })
  })

  it('marks a still-pending optimistic message as failed', () => {
    const withOptimistic = chatRuntimeReducer(
      { ...INITIAL_RUNTIME_STATE, identity: IDENTITY },
      { type: 'message.optimisticAdded', message: ownMessage({}) },
    )

    const failed = chatRuntimeReducer(withOptimistic, { type: 'message.failed', localId: 'l1' })

    expect(failed.room.timeline[0]).toMatchObject({ sendStatus: 'failed' })
  })

  it('message.uploaded подставляет mxc и снимает локальный upload — повтор пойдёт как обычная отправка', () => {
    const draft = {
      ...ownMessage({}),
      kind: 'file' as const,
      content: { body: 'doc.pdf', url: '', filename: 'doc.pdf', info: { mimetype: '', size: 1 } },
      upload: { file: new File([], 'doc.pdf'), pct: 40 },
    }
    const withDraft = chatRuntimeReducer(
      { ...INITIAL_RUNTIME_STATE, identity: IDENTITY },
      { type: 'message.optimisticAdded', message: draft },
    )

    const uploaded = chatRuntimeReducer(withDraft, {
      type: 'message.uploaded',
      localId: 'l1',
      url: 'mxc://bank.ru/abc',
    })

    expect(uploaded.room.timeline[0]).toMatchObject({ content: { url: 'mxc://bank.ru/abc' } })
    expect(uploaded.room.timeline[0]).not.toHaveProperty('upload')
  })

  it('повтор загрузки возвращает прогресс в 0 — отменить можно до первого progress-события', () => {
    // message.failed гасит pct в null, и без возврата в 0 MediaContent считает загрузку
    // неактивной: XHR уже идёт, а крестика отмены нет — вплоть до первого onprogress
    // (которого при !lengthComputable может не быть вовсе).
    const draft = {
      ...ownMessage({ txnId: 'txn-1' }),
      kind: 'file' as const,
      content: { body: '', url: '', filename: 'doc.pdf', info: { mimetype: '', size: 1 } },
      upload: { file: new File([], 'doc.pdf'), pct: 40 },
    }
    const failed = chatRuntimeReducer(
      chatRuntimeReducer(
        { ...INITIAL_RUNTIME_STATE, identity: IDENTITY },
        { type: 'message.optimisticAdded', message: draft },
      ),
      { type: 'message.failed', localId: 'l1' },
    )
    expect(failed.room.timeline[0]).toMatchObject({ upload: { pct: null } })

    const retrying = chatRuntimeReducer(failed, { type: 'message.retrying', localId: 'l1' })

    expect(retrying.room.timeline[0]).toMatchObject({ sendStatus: 'sending', upload: { pct: 0 } })
  })

  it('повтор отправки уже загруженного файла не воскрешает upload-стейт', () => {
    // mxc получен, upload снят в message.uploaded — повторяется только PUT /send,
    // прогресс-полоске взяться неоткуда
    const sent = {
      ...ownMessage({ txnId: 'txn-1' }),
      kind: 'file' as const,
      content: {
        body: '',
        url: 'mxc://bank.ru/abc',
        filename: 'doc.pdf',
        info: { mimetype: '', size: 1 },
      },
    }
    const failed = chatRuntimeReducer(
      chatRuntimeReducer(
        { ...INITIAL_RUNTIME_STATE, identity: IDENTITY },
        { type: 'message.optimisticAdded', message: sent },
      ),
      { type: 'message.failed', localId: 'l1' },
    )

    const retrying = chatRuntimeReducer(failed, { type: 'message.retrying', localId: 'l1' })

    expect(retrying.room.timeline[0]).not.toHaveProperty('upload')
  })

  it('message.discarded убирает отменённый черновик из ленты', () => {
    const withOptimistic = chatRuntimeReducer(
      { ...INITIAL_RUNTIME_STATE, identity: IDENTITY },
      { type: 'message.optimisticAdded', message: ownMessage({}) },
    )

    const discarded = chatRuntimeReducer(withOptimistic, {
      type: 'message.discarded',
      localId: 'l1',
    })

    expect(discarded.room.timeline).toHaveLength(0)
  })

  it('does not mark a message failed after sync already resolved it', () => {
    const withOptimistic = chatRuntimeReducer(
      { ...INITIAL_RUNTIME_STATE, identity: IDENTITY },
      { type: 'message.optimisticAdded', message: ownMessage({ txnId: 'txn-1' }) },
    )
    const resolvedBySync = chatRuntimeReducer(withOptimistic, {
      type: 'sync.received',
      cursor: 's1',
      room: roomPatch({
        // txnId совпадает с оптимистичным — иначе mergeTimeline не свяжет черновик с реальным событием
        timeline: [
          textItem({
            localId: '$real',
            eventId: '$real',
            sender: IDENTITY.userId,
            body: 'hi',
            txnId: 'txn-1',
          }),
        ],
      }),
    })

    const failedLate = chatRuntimeReducer(resolvedBySync, { type: 'message.failed', localId: 'l1' })

    expect(failedLate.room.timeline).toHaveLength(1)
    expect(failedLate.room.timeline[0]!.eventId).toBe('$real')
    expect(failedLate.room.timeline[0]).toMatchObject({ sendStatus: 'sent' })
  })

  it('folds operator read marker into readReceipts (индикатор — при рендере)', () => {
    const next = chatRuntimeReducer(connectedWithSentMessage(), {
      type: 'sync.received',
      cursor: 's2',
      room: roomPatch({ readMarkers: [{ userId: OPERATOR, eventId: '$real' }] }),
    })

    // sendStatus не мутируется — «прочитано» вычисляется в рендере из readReceipts
    expect(next.room.readReceipts[OPERATOR]).toEqual({ eventId: '$real' })
    expect(next.room.timeline[0]).toMatchObject({ sendStatus: 'sent' })
  })

  it('keeps prior read receipts across a later sync without markers', () => {
    const withReceipt = chatRuntimeReducer(connectedWithSentMessage(), {
      type: 'sync.received',
      cursor: 's2',
      room: roomPatch({ readMarkers: [{ userId: OPERATOR, eventId: '$real' }] }),
    })

    const resynced = chatRuntimeReducer(withReceipt, {
      type: 'sync.received',
      cursor: 's3',
      room: roomPatch({
        timeline: [
          textItem({ localId: '$real', eventId: '$real', sender: IDENTITY.userId, body: 'hi' }),
        ],
      }),
    })

    expect(resynced.room.readReceipts[OPERATOR]).toEqual({ eventId: '$real' })
  })

  it('receipt.markedRead двигает собственный маркер оптимистично, receipt.sendFailed откатывает', () => {
    const marked = chatRuntimeReducer(connectedWithSentMessage(), {
      type: 'receipt.markedRead',
      userId: IDENTITY.userId,
      eventId: '$real',
    })
    expect(marked.room.readReceipts[IDENTITY.userId]).toEqual({ eventId: '$real' })

    // POST упал → откат до прежнего значения (null = маркера не было → ключ удаляется)
    const rolledBack = chatRuntimeReducer(marked, {
      type: 'receipt.sendFailed',
      userId: IDENTITY.userId,
      eventId: '$real',
      rollbackTo: null,
    })
    expect(rolledBack.room.readReceipts[IDENTITY.userId]).toBeUndefined()
  })

  it('receipt.sendFailed не откатывает маркер, уехавший дальше более поздним markRead', () => {
    const state = chatRuntimeReducer(connectedWithSentMessage(), {
      type: 'receipt.markedRead',
      userId: IDENTITY.userId,
      eventId: '$newer',
    })

    // провалился СТАРЫЙ POST на $real — маркер уже на $newer, трогать нельзя
    const next = chatRuntimeReducer(state, {
      type: 'receipt.sendFailed',
      userId: IDENTITY.userId,
      eventId: '$real',
      rollbackTo: null,
    })

    expect(next).toBe(state)
    expect(next.room.readReceipts[IDENTITY.userId]).toEqual({ eventId: '$newer' })
  })

  it('серверное эхо НЕ откатывает оптимистичный маркер назад по ленте', () => {
    // лента: [$real, $next]; markRead уже на $next, эхо приносит receipt на $real
    const base = connectedWithSentMessage()
    const withNext = chatRuntimeReducer(base, {
      type: 'sync.received',
      cursor: 's2',
      room: roomPatch({
        timeline: [textItem({ localId: '$next', eventId: '$next', ts: 2 })],
      }),
    })
    const marked = chatRuntimeReducer(withNext, {
      type: 'receipt.markedRead',
      userId: IDENTITY.userId,
      eventId: '$next',
    })

    const echoed = chatRuntimeReducer(marked, {
      type: 'sync.received',
      cursor: 's3',
      room: roomPatch({ readMarkers: [{ userId: IDENTITY.userId, eventId: '$real' }] }),
    })

    expect(echoed.room.readReceipts[IDENTITY.userId]).toEqual({ eventId: '$next' })
  })

  it('retries a failed message in place — sending again, index unchanged', () => {
    const withFirst = chatRuntimeReducer(
      { ...INITIAL_RUNTIME_STATE, identity: IDENTITY },
      {
        type: 'message.optimisticAdded',
        message: ownMessage({ localId: 'l1', body: 'first', sendStatus: 'failed' }),
      },
    )
    const withSecond = chatRuntimeReducer(withFirst, {
      type: 'message.optimisticAdded',
      message: ownMessage({
        localId: 'l2',
        eventId: 'optimistic:l2',
        body: 'second',
        ts: 2,
        sendStatus: 'sent',
      }),
    })

    const retried = chatRuntimeReducer(withSecond, { type: 'message.retrying', localId: 'l1' })

    expect(retried.room.timeline).toHaveLength(2)
    expect(retried.room.timeline[0]).toMatchObject({ localId: 'l1', sendStatus: 'sending' })
    expect(retried.room.timeline[1]).toMatchObject({ localId: 'l2', sendStatus: 'sent' })
  })
})

describe('chatRuntimeReducer — реакции', () => {
  function connected(): ChatRuntimeState {
    return chatRuntimeReducer(INITIAL_RUNTIME_STATE, {
      type: 'session.started',
      identity: IDENTITY,
      cursor: 's1',
      room: initialPatch(),
    })
  }

  it('reaction.added кладёт оптимистичную реакцию, reaction.confirmed проставляет ей серверный id', () => {
    const added = chatRuntimeReducer(connected(), {
      type: 'reaction.added',
      targetEventId: '$m1',
      entry: { eventId: 'optimistic:l1', sender: IDENTITY.userId, key: '👍' },
    })

    const confirmed = chatRuntimeReducer(added, {
      type: 'reaction.confirmed',
      targetEventId: '$m1',
      localEventId: 'optimistic:l1',
      eventId: '$r1',
    })

    expect(added.room.reactions['$m1']).toHaveLength(1)
    expect(confirmed.room.reactions['$m1']).toEqual([
      { eventId: '$r1', sender: IDENTITY.userId, key: '👍' },
    ])
  })

  it('reaction.removed убирает реакцию — им же откатывается неудачная постановка', () => {
    const added = chatRuntimeReducer(connected(), {
      type: 'reaction.added',
      targetEventId: '$m1',
      entry: { eventId: 'optimistic:l1', sender: IDENTITY.userId, key: '👍' },
    })

    const removed = chatRuntimeReducer(added, {
      type: 'reaction.removed',
      targetEventId: '$m1',
      eventId: 'optimistic:l1',
    })

    expect(removed.room.reactions).toEqual({})
  })

  it('эхо из sync схлопывается с оптимистичной реакцией, а не удваивает её', () => {
    const added = chatRuntimeReducer(connected(), {
      type: 'reaction.added',
      targetEventId: '$m1',
      entry: { eventId: 'optimistic:l1', sender: IDENTITY.userId, key: '👍' },
    })

    const synced = chatRuntimeReducer(added, {
      type: 'sync.received',
      cursor: 's2',
      room: roomPatch({
        reactions: [
          {
            op: 'add',
            targetEventId: '$m1',
            entry: { eventId: '$r1', sender: IDENTITY.userId, key: '👍' },
          },
        ],
      }),
    })

    expect(synced.room.reactions['$m1']).toEqual([
      { eventId: '$r1', sender: IDENTITY.userId, key: '👍' },
    ])
  })

  it('редакция из sync снимает реакцию', () => {
    const reacted = chatRuntimeReducer(connected(), {
      type: 'sync.received',
      cursor: 's2',
      room: roomPatch({
        reactions: [
          {
            op: 'add',
            targetEventId: '$m1',
            entry: { eventId: '$r1', sender: OPERATOR, key: '👍' },
          },
        ],
      }),
    })

    const redacted = chatRuntimeReducer(reacted, {
      type: 'sync.received',
      cursor: 's3',
      room: roomPatch({ reactions: [{ op: 'remove', eventId: '$r1' }] }),
    })

    expect(redacted.room.reactions).toEqual({})
  })

  it('реакция переживает приход своего сообщения: в истории она идёт раньше цели', () => {
    const reactionFirst = chatRuntimeReducer(connected(), {
      type: 'history.loaded',
      items: [],
      reactions: [
        {
          op: 'add',
          targetEventId: '$old',
          entry: { eventId: '$r1', sender: OPERATOR, key: '👍' },
        },
      ],
      cardAnswers: [],
      mediaVerdicts: [],
      prevBatch: 'p2',
    })

    const withTarget = chatRuntimeReducer(reactionFirst, {
      type: 'history.loaded',
      items: [textItem({ localId: '$old', eventId: '$old', ts: 0 })],
      reactions: [],
      cardAnswers: [],
      mediaVerdicts: [],
      prevBatch: 'p3',
    })

    expect(withTarget.room.reactions['$old']).toHaveLength(1)
    expect(withTarget.room.timeline[0]?.eventId).toBe('$old')
  })
})

describe('chatRuntimeReducer — курсор истории', () => {
  function started(): ChatRuntimeState {
    return chatRuntimeReducer(INITIAL_RUNTIME_STATE, {
      type: 'session.started',
      identity: IDENTITY,
      cursor: 's1',
      room: initialPatch(),
    })
  }

  it('берёт prev_batch из initial sync', () => {
    expect(started().room.prevBatch).toBe('p1')
  })

  it('без prev_batch (комната короче лимита) подгружать нечего', () => {
    const next = chatRuntimeReducer(INITIAL_RUNTIME_STATE, {
      type: 'session.started',
      identity: IDENTITY,
      cursor: 's1',
      room: roomPatch({ timeline: [textItem()] }),
    })

    expect(next.room.prevBatch).toBeNull()
  })

  it('sync.received не трогает курсор истории', () => {
    // инкрементальный sync prev_batch не присылает; курсор двигает только сама подгрузка
    const paginated = chatRuntimeReducer(started(), {
      type: 'history.loaded',
      items: [],
      reactions: [],
      cardAnswers: [],
      mediaVerdicts: [],
      prevBatch: 'p2',
    })

    const synced = chatRuntimeReducer(paginated, {
      type: 'sync.received',
      cursor: 's2',
      room: roomPatch({ timeline: [textItem({ localId: '$m2', eventId: '$m2' })] }),
    })

    expect(synced.room.prevBatch).toBe('p2')
  })

  it('resume той же комнаты сохраняет продвинутый курсор, а не откатывает его к низу ленты', () => {
    // свежий initial sync принесёт prev_batch на «низ» ленты — приняв его, мы запросили бы
    // заново уже загруженные страницы
    const paginated = chatRuntimeReducer(started(), {
      type: 'history.loaded',
      items: [],
      reactions: [],
      cardAnswers: [],
      mediaVerdicts: [],
      prevBatch: 'p2',
    })

    const resumed = chatRuntimeReducer(paginated, {
      type: 'session.started',
      identity: IDENTITY,
      cursor: 's9',
      room: initialPatch(),
    })

    expect(resumed.room.prevBatch).toBe('p2')
  })

  it('новая комната берёт свой курсор с нуля', () => {
    const resumed = chatRuntimeReducer(INITIAL_RUNTIME_STATE, {
      type: 'session.started',
      identity: { userId: '@user2:bank', roomId: '!other:bank' },
      cursor: 's9',
      room: initialPatch(),
    })

    expect(resumed.room.prevBatch).toBe('p1')
  })

  it('session.started снимает флаг загрузки, зависший от прерванной подгрузки', () => {
    // подгрузку оборвала пересборка сессии — иначе флаг остался бы взведён навсегда
    const loading = chatRuntimeReducer(started(), { type: 'history.loading' })

    const resumed = chatRuntimeReducer(loading, {
      type: 'session.started',
      identity: IDENTITY,
      cursor: 's9',
      room: initialPatch(),
    })

    expect(loading.room.isLoadingHistory).toBe(true)
    expect(resumed.room.isLoadingHistory).toBe(false)
  })

  it('history.loaded не снимает флаг загрузки — цикл может продолжиться', () => {
    // страница без отображаемых событий: контроллер тут же тянет следующую, и гард
    // ре-энтранси обязан удержаться до history.settled
    const loading = chatRuntimeReducer(started(), { type: 'history.loading' })

    const loaded = chatRuntimeReducer(loading, {
      type: 'history.loaded',
      items: [],
      reactions: [],
      cardAnswers: [],
      mediaVerdicts: [],
      prevBatch: 'p2',
    })
    const settled = chatRuntimeReducer(loaded, { type: 'history.settled' })

    expect(loaded.room.isLoadingHistory).toBe(true)
    expect(settled.room.isLoadingHistory).toBe(false)
  })

  it('history.loaded кладёт события в начало ленты', () => {
    const loaded = chatRuntimeReducer(started(), {
      type: 'history.loaded',
      items: [textItem({ localId: '$old', eventId: '$old', body: 'старое', ts: 0 })],
      reactions: [],
      cardAnswers: [],
      mediaVerdicts: [],
      prevBatch: null,
    })

    expect(loaded.room.timeline.map((item) => item.eventId)).toEqual(['$old', '$m1'])
    expect(loaded.room.prevBatch).toBeNull()
  })

  it('history.loaded мерджит cardAnswers даже при пустых items', () => {
    // страница истории может состоять целиком из kc.adaptive.action — без этого
    // ответ на карточку из истории терялся бы, и её кнопки снова стали бы активны
    const loaded = chatRuntimeReducer(INITIAL_RUNTIME_STATE, {
      type: 'history.loaded',
      items: [],
      reactions: [],
      cardAnswers: [{ cardEventId: '$card', actionId: 'confirm', status: 'sent' }],
      mediaVerdicts: [],
      prevBatch: 'p2',
    })

    expect(loaded.room.cardAnswers.$card).toEqual({
      cardEventId: '$card',
      actionId: 'confirm',
      status: 'sent',
    })
  })
})

describe('chatRuntimeReducer — вердикты kc.media.status', () => {
  it('sync.received кладёт вердикт по media_id — не по event_id сообщения', () => {
    // Бэкенд шлёт один вердикт на файл (media_id), а не на каждое сообщение, которое
    // на него ссылается — привязка по event_id недоступна и не нужна.
    const next = chatRuntimeReducer(connectedWithSentMessage(), {
      type: 'sync.received',
      cursor: 's2',
      room: roomPatch({
        mediaVerdicts: [{ mediaId: 'abc', verdict: { status: 'rejected' } }],
      }),
    })

    expect(next.room.mediaVerdicts).toEqual({ abc: { status: 'rejected' } })
  })

  it('history.loaded мерджит вердикты даже при пустых items', () => {
    const loaded = chatRuntimeReducer(INITIAL_RUNTIME_STATE, {
      type: 'history.loaded',
      items: [],
      reactions: [],
      cardAnswers: [],
      mediaVerdicts: [{ mediaId: 'abc', verdict: { status: 'ready' } }],
      prevBatch: 'p2',
    })

    expect(loaded.room.mediaVerdicts).toEqual({ abc: { status: 'ready' } })
  })

  it('уже известный вердикт не перезаписывается повторной доставкой', () => {
    const first = chatRuntimeReducer(INITIAL_RUNTIME_STATE, {
      type: 'sync.received',
      cursor: 's1',
      room: roomPatch({ mediaVerdicts: [{ mediaId: 'abc', verdict: { status: 'ready' } }] }),
    })

    const second = chatRuntimeReducer(first, {
      type: 'sync.received',
      cursor: 's2',
      room: roomPatch({
        mediaVerdicts: [{ mediaId: 'abc', verdict: { status: 'rejected' } }],
      }),
    })

    expect(second.room.mediaVerdicts).toEqual({ abc: { status: 'ready' } })
  })

  it('вердикт, пришедший раньше эха своей отправки, всё равно виден на черновике', () => {
    // message.uploaded подставляет реальный mxc в content.url ещё ДО ответа PUT /send —
    // значит mediaId у черновика известен раньше, чем событие вообще уйдёт на сервер.
    // room.mediaVerdicts не привязан к конкретному элементу таймлайна, поэтому вердикт
    // приходит и остаётся доступным независимо от того, дошло уже эхо или нет.
    const draft = {
      ...ownMessage({ txnId: 'txn-1' }),
      kind: 'file' as const,
      content: { body: '', url: '', filename: 'doc.pdf', info: { mimetype: '', size: 1 } },
      upload: { file: new File([], 'doc.pdf'), pct: 40 },
    }
    const uploaded = chatRuntimeReducer(
      chatRuntimeReducer(
        { ...INITIAL_RUNTIME_STATE, identity: IDENTITY },
        { type: 'message.optimisticAdded', message: draft },
      ),
      { type: 'message.uploaded', localId: 'l1', url: 'mxc://bank.ru/abc' },
    )

    // Вердикт долетает раньше /sync-эха — сообщение всё ещё optimistic (sendStatus: 'sending').
    const withVerdict = chatRuntimeReducer(uploaded, {
      type: 'sync.received',
      cursor: 's2',
      room: roomPatch({
        mediaVerdicts: [{ mediaId: 'abc', verdict: { status: 'rejected' } }],
      }),
    })

    expect(withVerdict.room.timeline[0]).toMatchObject({ sendStatus: 'sending' })
    expect(withVerdict.room.mediaVerdicts).toEqual({
      abc: { status: 'rejected' },
    })

    // Эхо приходит позже и резолвит черновик в реальное сообщение — вердикт переживает и это.
    const resolved = chatRuntimeReducer(withVerdict, {
      type: 'sync.received',
      cursor: 's3',
      room: roomPatch({
        timeline: [
          fileItem({
            eventId: '$real',
            txnId: 'txn-1',
            sender: IDENTITY.userId,
            sendStatus: 'sent',
            content: { url: 'mxc://bank.ru/abc' },
          }),
        ],
      }),
    })

    expect(resolved.room.timeline).toHaveLength(1)
    expect(resolved.room.timeline[0]).toMatchObject({ eventId: '$real', sendStatus: 'sent' })
    expect(resolved.room.mediaVerdicts).toEqual({
      abc: { status: 'rejected' },
    })
  })
})

describe('chatRuntimeReducer — ответы на Adaptive Card', () => {
  it('card.answering заводит запись со статусом sending', () => {
    const next = chatRuntimeReducer(INITIAL_RUNTIME_STATE, {
      type: 'card.answering',
      cardEventId: '$card',
      actionId: 'confirm',
    })

    expect(next.room.cardAnswers.$card).toEqual({
      cardEventId: '$card',
      actionId: 'confirm',
      status: 'sending',
    })
  })

  it('card.answering не откатывает уже подтверждённый (sent) ответ', () => {
    const sent = chatRuntimeReducer(INITIAL_RUNTIME_STATE, {
      type: 'card.answering',
      cardEventId: '$card',
      actionId: 'confirm',
    })
    const confirmed = chatRuntimeReducer(sent, { type: 'card.answered', cardEventId: '$card' })

    // повторный клик/гонка с эхом sync — не должен вернуть кнопку в "sending"
    const next = chatRuntimeReducer(confirmed, {
      type: 'card.answering',
      cardEventId: '$card',
      actionId: 'confirm',
    })

    expect(next).toBe(confirmed)
    expect(next.room.cardAnswers.$card?.status).toBe('sent')
  })

  it('card.answerFailed переводит sending → failed, кнопки снова доступны', () => {
    const sending = chatRuntimeReducer(INITIAL_RUNTIME_STATE, {
      type: 'card.answering',
      cardEventId: '$card',
      actionId: 'confirm',
    })

    const failed = chatRuntimeReducer(sending, { type: 'card.answerFailed', cardEventId: '$card' })

    expect(failed.room.cardAnswers.$card?.status).toBe('failed')
  })

  it('card.answerFailed не трогает уже подтверждённый ответ (гонка с успешным эхом)', () => {
    const sent = chatRuntimeReducer(INITIAL_RUNTIME_STATE, {
      type: 'card.answering',
      cardEventId: '$card',
      actionId: 'confirm',
    })
    const confirmed = chatRuntimeReducer(sent, { type: 'card.answered', cardEventId: '$card' })

    const next = chatRuntimeReducer(confirmed, { type: 'card.answerFailed', cardEventId: '$card' })

    expect(next).toBe(confirmed)
  })

  it('sync-эхо (applySync) не откатывает уже подтверждённый локально ответ', () => {
    const answering = chatRuntimeReducer(INITIAL_RUNTIME_STATE, {
      type: 'card.answering',
      cardEventId: '$card',
      actionId: 'confirm',
    })
    const confirmedLocally = chatRuntimeReducer(answering, {
      type: 'card.answered',
      cardEventId: '$card',
    })

    const synced = chatRuntimeReducer(confirmedLocally, {
      type: 'sync.received',
      cursor: 's2',
      room: roomPatch({
        cardAnswers: [{ cardEventId: '$card', actionId: 'confirm', status: 'sent' }],
      }),
    })

    expect(synced.room.cardAnswers.$card?.status).toBe('sent')
  })
})
