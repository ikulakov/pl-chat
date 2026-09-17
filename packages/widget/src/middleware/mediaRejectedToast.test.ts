import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediaVerdict, MediaVerdictEntry } from '@/domain/mediaVerdict'
import type { TimelineItem } from '@/domain/timeline'
import { mediaRejectedToast } from './mediaRejectedToast'
import type { ChatRuntimeState, RuntimeAction } from '@/store/state'
import type { Dispatch } from '@/store/store'

const scrollTimelineTo = vi.hoisted(() => vi.fn())
const showToast = vi.hoisted(() => vi.fn())

vi.mock('@/shared/timeline/timelineScroll', () => ({ scrollTimelineTo }))
vi.mock('@/shared/ui/Toast', () => ({ showToast }))

const OWN = '@me:bank.ru'

const mediaItem = (sender: string, mediaId: string): TimelineItem => ({
  kind: 'file',
  localId: `local-${mediaId}`,
  eventId: `event-${mediaId}`,
  sender,
  ts: 0,
  sendStatus: 'sent',
  content: {
    body: 'doc.pdf',
    url: `mxc://bank.ru/${mediaId}`,
    filename: 'doc.pdf',
    info: { mimetype: 'application/pdf', size: 10 },
  },
})

function state(
  timeline: TimelineItem[],
  mediaVerdicts: Record<string, MediaVerdict> = {},
): ChatRuntimeState {
  return {
    phase: 'ready',
    online: true,
    identity: { userId: OWN, roomId: '!room:bank.ru' },
    cursor: null,
    room: {
      timeline,
      operator: { isActive: false, id: null, displayName: null },
      readReceipts: {},
      reactions: {},
      cardAnswers: {},
      mediaVerdicts,
      replyTarget: null,
      prevBatch: null,
      isLoadingHistory: false,
    },
  }
}

const verdictsSync = (mediaVerdicts: MediaVerdictEntry[]): RuntimeAction => ({
  type: 'sync.received',
  cursor: 'next',
  room: {
    timeline: [],
    readMarkers: [],
    reactions: [],
    cardAnswers: [],
    mediaVerdicts,
    prevBatch: null,
  },
})

const rejectedSync = (mediaId: string): RuntimeAction =>
  verdictsSync([{ mediaId, verdict: { status: 'rejected' } }])

/** Мидлвар с подменённым стором: getState отдаёт `prevState`, пока действие не дошло до редьюсера. */
function withStates(prevState: ChatRuntimeState, nextState: ChatRuntimeState): Dispatch {
  let current = prevState

  return mediaRejectedToast({ getState: () => current })(() => {
    current = nextState
  })
}

describe('mediaRejectedToast', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('показывает тост на новый отказ по своему файлу и ведёт к нему', () => {
    const prevState = state([])
    const nextState = state([mediaItem(OWN, 'mine')], { mine: { status: 'rejected' } })
    const dispatch = withStates(prevState, nextState)

    dispatch(rejectedSync('mine'))

    expect(showToast).toHaveBeenCalledTimes(1)
    showToast.mock.calls[0]?.[1].onClick()
    expect(scrollTimelineTo).toHaveBeenCalledWith('local-mine')
  })

  it('молчит, когда вердикт уже был известен до применения патча', () => {
    const known = state([mediaItem(OWN, 'mine')], { mine: { status: 'rejected' } })
    const dispatch = withStates(known, known)

    dispatch(rejectedSync('mine'))

    expect(showToast).not.toHaveBeenCalled()
  })

  it('тост говорит о том, что в сторе, а не в батче', () => {
    // два вердикта на файл в одном батче: стор оставил первый (ready), отказ в батче — не повод
    const nextState = state([mediaItem(OWN, 'mine')], { mine: { status: 'ready' } })
    const dispatch = withStates(state([]), nextState)

    dispatch(
      verdictsSync([
        { mediaId: 'mine', verdict: { status: 'ready' } },
        { mediaId: 'mine', verdict: { status: 'rejected' } },
      ]),
    )

    expect(showToast).not.toHaveBeenCalled()
  })

  it('молчит про файл оператора', () => {
    const nextState = state([mediaItem('@operator:bank.ru', 'theirs')], {
      theirs: { status: 'rejected' },
    })
    const dispatch = withStates(state([]), nextState)

    dispatch(rejectedSync('theirs'))

    expect(showToast).not.toHaveBeenCalled()
  })

  it('не трогает уведомления на страницах истории', () => {
    const nextState = state([mediaItem(OWN, 'mine')], { mine: { status: 'rejected' } })
    const dispatch = withStates(state([]), nextState)

    dispatch({
      type: 'history.loaded',
      items: [],
      reactions: [],
      cardAnswers: [],
      mediaVerdicts: [{ mediaId: 'mine', verdict: { status: 'rejected' } }],
      prevBatch: null,
    })

    expect(showToast).not.toHaveBeenCalled()
  })
})
