import { describe, expect, it } from 'vitest'
import {
  addReaction,
  aggregateReactions,
  applyReactionDelta,
  removeReaction,
  type ReactionIndex,
} from './reactions'

const ME = '@u:bank'
const OPERATOR = '@operator:bank'

describe('addReaction', () => {
  it('складывает реакции разных участников на одно сообщение', () => {
    const withMine = addReaction({}, '$m1', { eventId: '$r1', sender: ME, key: '👍' })

    const withBoth = addReaction(withMine, '$m1', {
      eventId: '$r2',
      sender: OPERATOR,
      key: '👍',
    })

    expect(withBoth['$m1']).toEqual([
      { eventId: '$r1', sender: ME, key: '👍' },
      { eventId: '$r2', sender: OPERATOR, key: '👍' },
    ])
  })

  it('повторное добавление того же события не создаёт новую ссылку', () => {
    // так приходит эхо из /sync на реакцию, уже записанную по ответу сервера
    const index = addReaction({}, '$m1', { eventId: '$r1', sender: ME, key: '👍' })

    expect(addReaction(index, '$m1', { eventId: '$r1', sender: ME, key: '👍' })).toBe(index)
  })
})

describe('removeReaction', () => {
  it('находит цель сама — редакция называет только событие реакции', () => {
    const index: ReactionIndex = {
      $m1: [{ eventId: '$r1', sender: ME, key: '👍' }],
      $m2: [{ eventId: '$r2', sender: OPERATOR, key: '❤️' }],
    }

    // опустевшее сообщение уходит из индекса целиком
    expect(removeReaction(index, '$r2')).toEqual({ $m1: index['$m1'] })
  })

  it('не трогает реакции соседних сообщений и сохраняет их ссылки', () => {
    const index: ReactionIndex = {
      $m1: [{ eventId: '$r1', sender: ME, key: '👍' }],
      $m2: [{ eventId: '$r2', sender: OPERATOR, key: '❤️' }],
    }

    const next = removeReaction(index, '$r1')

    // ссылочная стабильность нетронутого сообщения — от неё зависит memo на MessageRow
    expect(next['$m2']).toBe(index['$m2'])
  })

  it('возвращает тот же индекс, когда снимать нечего', () => {
    const index = addReaction({}, '$m1', { eventId: '$r1', sender: ME, key: '👍' })

    expect(removeReaction(index, '$unknown')).toBe(index)
  })
})

describe('applyReactionDelta', () => {
  it('применяет операции по порядку: снятая и заново поставленная реакция остаётся', () => {
    // сервер дедуплицирует по (target, sender, key) и на повторную реакцию может вернуть
    // прежний event_id — при раскладке по корзинам «добавили/сняли» она бы потерялась
    const index = applyReactionDelta({}, [
      { op: 'add', targetEventId: '$m1', entry: { eventId: '$r1', sender: ME, key: '👍' } },
      { op: 'remove', eventId: '$r1' },
      { op: 'add', targetEventId: '$m1', entry: { eventId: '$r1', sender: ME, key: '👍' } },
    ])

    expect(index['$m1']).toHaveLength(1)
  })

  it('хранит реакцию на ещё не подгруженное сообщение', () => {
    // страница истории dir=b отдаёт реакцию раньше её цели
    const index = applyReactionDelta({}, [
      { op: 'add', targetEventId: '$notLoaded', entry: { eventId: '$r1', sender: ME, key: '👍' } },
    ])

    expect(index['$notLoaded']).toHaveLength(1)
  })
})

describe('aggregateReactions', () => {
  it('считает реакции по ключу и помечает свою', () => {
    const summaries = aggregateReactions(
      [
        { eventId: '$r1', sender: OPERATOR, key: '👍' },
        { eventId: '$r2', sender: ME, key: '👍' },
        { eventId: '$r3', sender: OPERATOR, key: '❤️' },
      ],
      ME,
    )

    expect(summaries).toEqual([
      { key: '👍', count: 2, isOwn: true },
      { key: '❤️', count: 1, isOwn: false },
    ])
  })

  it('держит порядок по первому появлению ключа, а не по автору', () => {
    // чип не должен прыгать от того, что вторым участником проставлена та же реакция
    const summaries = aggregateReactions(
      [
        { eventId: '$r1', sender: OPERATOR, key: '❤️' },
        { eventId: '$r2', sender: ME, key: '👍' },
        { eventId: '$r3', sender: ME, key: '❤️' },
      ],
      ME,
    )

    expect(summaries.map((s) => s.key)).toEqual(['❤️', '👍'])
  })

  it('считает участников, а не события: дубль одного автора — один голос', () => {
    // сервер дедуплицирует асинхронно — два быстрых запроса из двух вкладок оставляют два события
    const summaries = aggregateReactions(
      [
        { eventId: '$r1', sender: ME, key: '👍' },
        { eventId: '$r2', sender: ME, key: '👍' },
      ],
      ME,
    )

    expect(summaries).toEqual([{ key: '👍', count: 1, isOwn: true }])
  })

  it('недоведённый выбор заменяет свои реакции из индекса, чужие оставляя', () => {
    const entries = [
      { eventId: '$r1', sender: OPERATOR, key: '👍' },
      { eventId: '$r2', sender: ME, key: '👍' },
      { eventId: '$r3', sender: ME, key: '😂' },
    ]

    expect(aggregateReactions(entries, ME, '❤️')).toEqual([
      { key: '👍', count: 1, isOwn: false },
      { key: '❤️', count: 1, isOwn: true },
    ])
    // выбор «снять» прячет свои сразу, не дожидаясь редакции
    expect(aggregateReactions(entries, ME, null)).toEqual([{ key: '👍', count: 1, isOwn: false }])
  })

  it('на сообщении без реакций отдаёт пустой список', () => {
    expect(aggregateReactions(undefined, ME)).toEqual([])
    expect(aggregateReactions(undefined, ME, null)).toEqual([])
  })
})
