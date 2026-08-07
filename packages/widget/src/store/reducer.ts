import { applyCardAnswers } from '../domain/adaptiveCards'
import { mergeTimeline, prependTimeline } from '../domain/mergeTimeline'
import { applyReadMarkers } from '../domain/receipts'
import type { RoomSyncPatch } from '../domain/roomSync'
import type { MessageTimelineItem, TimelineItem } from '../domain/timeline'
import { isMedia, isSystem } from '../domain/timeline'
import { assertNever } from '../shared/utils/assertNever'
import type { ChatRuntimeState, RoomState, RuntimeAction } from './state'
import { INITIAL_ROOM_STATE, INITIAL_RUNTIME_STATE } from './store'

function updateRoom(state: ChatRuntimeState, patch: Partial<RoomState>): ChatRuntimeState {
  return { ...state, room: { ...state.room, ...patch } }
}

function updateTimeline(
  state: ChatRuntimeState,
  updater: (timeline: RoomState['timeline']) => RoomState['timeline'],
): ChatRuntimeState {
  return updateRoom(state, { timeline: updater(state.room.timeline) })
}

function updateMessage(
  state: ChatRuntimeState,
  localId: string,
  updater: (message: MessageTimelineItem) => TimelineItem,
): ChatRuntimeState {
  return updateTimeline(state, (timeline) =>
    timeline.map((m) => (!isSystem(m) && m.localId === localId ? updater(m) : m)),
  )
}

function applySync(room: RoomState, patch: RoomSyncPatch): RoomState {
  const timeline = mergeTimeline(room.timeline, patch.timeline)

  return {
    ...room,
    timeline,
    operator: patch.operator ?? room.operator,
    readReceipts: applyReadMarkers(room.readReceipts, patch.readMarkers, timeline),
    cardAnswers: applyCardAnswers(room.cardAnswers, patch.cardAnswers),
  }
}

function startRoom(patch: RoomSyncPatch): RoomState {
  return {
    ...applySync(INITIAL_ROOM_STATE, patch),
    prevBatch: patch.prevBatch,
  }
}

function continueRoom(room: RoomState, patch: RoomSyncPatch): RoomState {
  return {
    ...applySync(room, patch),
    // курсор истории держим свой — из снимка он откатит подгрузку к низу ленты
    prevBatch: room.prevBatch,
    isLoadingHistory: false,
  }
}

export function chatRuntimeReducer(
  state: ChatRuntimeState,
  action: RuntimeAction,
): ChatRuntimeState {
  switch (action.type) {
    case 'connection.connecting':
      return { ...state, phase: 'connecting', error: null }

    case 'session.recovering':
      return { ...state, phase: 'recovering', error: null }

    case 'connection.failed':
      return { ...INITIAL_RUNTIME_STATE, phase: 'error', error: action.error }

    case 'session.closed':
      return INITIAL_RUNTIME_STATE

    case 'session.started': {
      const { identity, cursor, room } = action

      // isSameRoom достижим только в авторизованной зоне:
      // при протухшем токене re-auth авторизованному пользователю вернёт ту же комнату при живой ленте;
      // гостю re-auth всегда даёт новую комнату.
      const isSameRoom = state.identity?.roomId === identity.roomId

      return {
        ...state,
        phase: 'connected',
        error: null,
        identity,
        cursor,
        room: isSameRoom ? continueRoom(state.room, room) : startRoom(room),
      }
    }

    case 'sync.received': {
      const { cursor, room } = action

      return {
        ...state,
        cursor,
        room: room ? applySync(state.room, room) : state.room,
      }
    }

    case 'message.optimisticAdded':
      return updateTimeline(state, (timeline) => [...timeline, action.message])

    case 'message.sent':
      return updateMessage(state, action.localId, (m) => ({
        ...m,
        eventId: action.eventId,
        sendStatus: 'sent',
      }))

    case 'message.failed':
      return updateMessage(state, action.localId, (m) => {
        if (m.sendStatus !== 'sending') return m

        const failed: MessageTimelineItem = { ...m, sendStatus: 'failed' }
        if (!isMedia(failed) || !failed.upload) return failed

        return {
          ...failed,
          upload: {
            ...failed.upload,
            pct: null,
            ...(action.upload ? { error: action.upload } : {}),
          },
        }
      })

    case 'message.retrying':
      return updateMessage(state, action.localId, (m) => {
        const retrying: MessageTimelineItem = { ...m, sendStatus: 'sending' }

        if (!isMedia(retrying) || !retrying.upload) return retrying

        // error снимается: причина прошлого отказа больше не описывает текущую попытку.
        const { error: _previous, ...upload } = retrying.upload
        return { ...retrying, upload: { ...upload, pct: 0 } }
      })

    case 'message.uploadProgress':
      return updateMessage(state, action.localId, (m) =>
        isMedia(m) && m.upload ? { ...m, upload: { ...m.upload, pct: action.pct } } : m,
      )

    case 'message.uploaded':
      return updateMessage(state, action.localId, (m) => {
        if (!isMedia(m)) return m

        const { upload: _uploaded, ...rest } = m
        return { ...rest, content: { ...m.content, url: action.url } }
      })

    case 'message.discarded':
      return updateTimeline(state, (timeline) =>
        timeline.filter((m) => m.localId !== action.localId),
      )

    case 'receipt.markedRead':
      return updateRoom(state, {
        readReceipts: {
          ...state.room.readReceipts,
          [action.userId]: { eventId: action.eventId },
        },
      })

    case 'receipt.sendFailed': {
      const { userId, eventId, rollbackTo } = action

      if (state.room.readReceipts[userId]?.eventId !== eventId) return state

      const readReceipts = { ...state.room.readReceipts }

      if (rollbackTo === null) {
        delete readReceipts[userId]
      } else {
        readReceipts[userId] = { eventId: rollbackTo }
      }
      return updateRoom(state, { readReceipts })
    }

    case 'reply.targeted':
      return updateRoom(state, { replyTarget: action.target })

    case 'reply.cleared':
      return state.room.replyTarget === null ? state : updateRoom(state, { replyTarget: null })

    case 'history.loading':
      return updateRoom(state, { isLoadingHistory: true })

    case 'history.loaded': {
      const { items, cardAnswers, prevBatch } = action

      return updateRoom(state, {
        timeline: prependTimeline(state.room.timeline, items),
        cardAnswers: applyCardAnswers(state.room.cardAnswers, cardAnswers),
        prevBatch,
      })
    }

    case 'history.settled':
      return updateRoom(state, { isLoadingHistory: false })

    case 'card.answering': {
      const { cardEventId, actionId } = action

      // Уже подтверждённый ответ не откатываем в "sending" повторным нажатием/эхом гонки.
      if (state.room.cardAnswers[cardEventId]?.status === 'sent') return state

      return updateRoom(state, {
        cardAnswers: {
          ...state.room.cardAnswers,
          [cardEventId]: { cardEventId, actionId, status: 'sending' },
        },
      })
    }

    case 'card.answered': {
      const current = state.room.cardAnswers[action.cardEventId]
      if (!current) return state

      return updateRoom(state, {
        cardAnswers: {
          ...state.room.cardAnswers,
          [action.cardEventId]: { ...current, status: 'sent' },
        },
      })
    }

    case 'card.answerFailed': {
      const current = state.room.cardAnswers[action.cardEventId]
      if (!current || current.status !== 'sending') return state

      return updateRoom(state, {
        cardAnswers: {
          ...state.room.cardAnswers,
          [action.cardEventId]: { ...current, status: 'failed' },
        },
      })
    }

    default:
      return assertNever(action)
  }
}
