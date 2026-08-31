import { describe, expect, it } from 'vitest'
import {
  addReaction,
  aggregateReactions,
  applyReactionDelta,
  confirmReaction,
  findOwnReaction,
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

  it('схлопывает эхо из /sync с оптимистичной записью того же автора и ключа', () => {
    // сервер дедуплицирует по (target, sender, key) — две такие записи всегда одно событие
    const optimistic = addReaction({}, '$m1', {
      eventId: 'optimistic:l1',
      sender: ME,
      key: '👍',
    })

    const echoed = addReaction(optimistic, '$m1', { eventId: '$r1', sender: ME, key: '👍' })

    expect(echoed['$m1']).toEqual([{ eventId: '$r1', sender: ME, key: '👍' }])
  })

  it('не даёт оптимистичной записи затереть уже известный реальный eventId', () => {
    // иначе снятие реакции упёрлось бы в placeholder и редакцию слать было бы некуда
    const real = addReaction({}, '$m1', { eventId: '$r1', sender: ME, key: '👍' })

    const next = addReaction(real, '$m1', { eventId: 'optimistic:l1', sender: ME, key: '👍' })

    expect(next).toBe(real)
  })

  it('повторное добавление того же события не создаёт новую ссылку', () => {
    const index = addReaction({}, '$m1', { eventId: '$r1', sender: ME, key: '👍' })

    expect(addReaction(index, '$m1', { eventId: '$r1', sender: ME, key: '👍' })).toBe(index)
  })
})

describe('confirmReaction', () => {
  it('меняет оптимистичный eventId на серверный', () => {
    const optimistic = addReaction({}, '$m1', {
      eventId: 'optimistic:l1',
      sender: ME,
      key: '👍',
    })

    const confirmed = confirmReaction(optimistic, '$m1', 'optimistic:l1', '$r1')

    expect(confirmed['$m1']).toEqual([{ eventId: '$r1', sender: ME, key: '👍' }])
  })

  it('ничего не делает, если эхо из /sync уже подменило запись', () => {
    const echoed = addReaction({}, '$m1', { eventId: '$r1', sender: ME, key: '👍' })

    expect(confirmReaction(echoed, '$m1', 'optimistic:l1', '$r1')).toBe(echoed)
  })
})

describe('removeReaction', () => {
  it('убирает запись и выбрасывает опустевшее сообщение из индекса', () => {
    const index = addReaction({}, '$m1', { eventId: '$r1', sender: ME, key: '👍' })

    expect(removeReaction(index, '$m1', '$r1')).toEqual({})
  })

  it('не трогает реакции соседних сообщений и сохраняет их ссылки', () => {
    const index: ReactionIndex = {
      $m1: [{ eventId: '$r1', sender: ME, key: '👍' }],
      $m2: [{ eventId: '$r2', sender: OPERATOR, key: '❤️' }],
    }

    const next = removeReaction(index, '$m1', '$r1')

    // ссылочная стабильность нетронутого сообщения — от неё зависит memo на MessageRow
    expect(next['$m2']).toBe(index['$m2'])
  })

  it('возвращает тот же индекс, когда снимать нечего', () => {
    const index = addReaction({}, '$m1', { eventId: '$r1', sender: ME, key: '👍' })

    expect(removeReaction(index, '$m1', '$unknown')).toBe(index)
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

  it('находит цель редакции сама — в самом событии редакции её нет', () => {
    const index = applyReactionDelta({}, [
      { op: 'add', targetEventId: '$m1', entry: { eventId: '$r1', sender: ME, key: '👍' } },
      { op: 'add', targetEventId: '$m2', entry: { eventId: '$r2', sender: ME, key: '❤️' } },
      { op: 'remove', eventId: '$r2' },
    ])

    expect(Object.keys(index)).toEqual(['$m1'])
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
  it('считает реакции по ключу и помечает свою её eventId', () => {
    const summaries = aggregateReactions(
      [
        { eventId: '$r1', sender: OPERATOR, key: '👍' },
        { eventId: '$r2', sender: ME, key: '👍' },
      ],
      ME,
    )

    expect(summaries).toEqual([{ key: '👍', count: 2, ownEventId: '$r2' }])
  })

  it('оставляет ownEventId пустым, когда своей реакции нет', () => {
    const summaries = aggregateReactions([{ eventId: '$r1', sender: OPERATOR, key: '👍' }], ME)

    expect(summaries).toEqual([{ key: '👍', count: 1, ownEventId: null }])
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

  it('на сообщении без реакций отдаёт пустой список', () => {
    expect(aggregateReactions(undefined, ME)).toEqual([])
  })
})

describe('findOwnReaction', () => {
  it('находит только свою реакцию с этим ключом', () => {
    const index: ReactionIndex = {
      $m1: [
        { eventId: '$r1', sender: OPERATOR, key: '👍' },
        { eventId: '$r2', sender: ME, key: '❤️' },
      ],
    }

    expect(findOwnReaction(index, '$m1', ME, '👍')).toBeUndefined()
    expect(findOwnReaction(index, '$m1', ME, '❤️')?.eventId).toBe('$r2')
  })
})
