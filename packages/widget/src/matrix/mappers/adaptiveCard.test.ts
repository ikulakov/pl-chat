import { describe, expect, it } from 'vitest'
import { roomMessageEvent } from '../../shared/testUtils/matrixFixtures'
import { MsgType } from '../wire/consts'
import { collectCardAnswers, toCardAnswer } from './adaptiveCard'

describe('toCardAnswer', () => {
  it('kc.adaptive.action даёт CardAnswer со статусом sent — сервер эхает уже принятые ответы', () => {
    const answer = toCardAnswer(
      roomMessageEvent({
        content: {
          msgtype: MsgType.AdaptiveAction,
          body: '[action: confirm]',
          adaptive_action: { action_id: 'confirm', source_event_id: '$card' },
        },
      }),
    )

    expect(answer).toEqual({ cardEventId: '$card', actionId: 'confirm', status: 'sent' })
  })

  it('другие msgtype и события без adaptive_action игнорируются', () => {
    expect(toCardAnswer(roomMessageEvent())).toBeUndefined()
  })

  it('adaptive_action без source_event_id или action_id не даёт ответ', () => {
    const noCard = toCardAnswer(
      roomMessageEvent({
        content: {
          msgtype: MsgType.AdaptiveAction,
          body: 'x',
          adaptive_action: { action_id: 'confirm', source_event_id: '' },
        },
      }),
    )
    const noAction = toCardAnswer(
      roomMessageEvent({
        content: {
          msgtype: MsgType.AdaptiveAction,
          body: 'x',
          adaptive_action: { action_id: '', source_event_id: '$card' },
        },
      }),
    )

    expect(noCard).toBeUndefined()
    expect(noAction).toBeUndefined()
  })
})

describe('collectCardAnswers', () => {
  it('собирает ответы, пропуская прочие события — страница истории может состоять из одних action', () => {
    const answers = collectCardAnswers([
      roomMessageEvent({
        event_id: '$a1',
        content: {
          msgtype: MsgType.AdaptiveAction,
          body: 'x',
          adaptive_action: { action_id: 'confirm', source_event_id: '$card1' },
        },
      }),
      roomMessageEvent({ event_id: '$txt' }),
      roomMessageEvent({
        event_id: '$a2',
        content: {
          msgtype: MsgType.AdaptiveAction,
          body: 'x',
          adaptive_action: { action_id: 'edit', source_event_id: '$card2' },
        },
      }),
    ])

    expect(answers).toEqual([
      { cardEventId: '$card1', actionId: 'confirm', status: 'sent' },
      { cardEventId: '$card2', actionId: 'edit', status: 'sent' },
    ])
  })
})
