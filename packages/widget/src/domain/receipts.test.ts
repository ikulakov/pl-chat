import { describe, expect, it } from 'vitest'
import { systemItem, textItem } from '../shared/testUtils/matrixFixtures'
import type { EphemeralEvent } from '../matrix/types'
import type { TimelineItem } from './timeline'
import {
  canMoveMarker,
  countUnread,
  mergeReadReceipts,
  readOwnEventIds,
  type ReadReceipt,
} from './receipts'

const OWN = '@guest:bank'
const OPERATOR = '@operator:bank'

function readReceiptEvent(
  content: Record<string, { 'm.read'?: Record<string, { ts?: number }> }>,
): EphemeralEvent {
  return { type: 'm.receipt', content }
}

function ownMsg(eventId: string, ts: number): TimelineItem {
  return textItem({ localId: eventId, eventId, sender: OWN, body: 'x', ts })
}

function opMsg(eventId: string, ts: number): TimelineItem {
  return textItem({ localId: eventId, eventId, sender: OPERATOR, body: 'x', ts })
}

describe('mergeReadReceipts', () => {
  const timeline = [ownMsg('$m1', 1), ownMsg('$m2', 2)]

  it('сворачивает m.read в карту userId → {eventId}', () => {
    const result = mergeReadReceipts(
      {},
      [readReceiptEvent({ $m1: { 'm.read': { [OPERATOR]: { ts: 10 } } } })],
      timeline,
    )

    expect(result).toEqual({ [OPERATOR]: { eventId: '$m1' } })
  })

  it('более поздний по ленте receipt юзера перетирает предыдущий', () => {
    const base: Record<string, ReadReceipt> = { [OPERATOR]: { eventId: '$m1' } }

    const result = mergeReadReceipts(
      base,
      [readReceiptEvent({ $m2: { 'm.read': { [OPERATOR]: { ts: 20 } } } })],
      timeline,
    )

    expect(result[OPERATOR]).toEqual({ eventId: '$m2' })
  })

  it('монотонность: запоздавшее эхо НЕ откатывает маркер назад по ленте', () => {
    // оптимистичный маркер уже на $m2 (markRead), сервер эхает предыдущий receipt на $m1 —
    // без гарда откат вызвал бы повторный POST и мигание производного unreadCount
    const base: Record<string, ReadReceipt> = { [OPERATOR]: { eventId: '$m2' } }

    const result = mergeReadReceipts(
      base,
      [readReceiptEvent({ $m1: { 'm.read': { [OPERATOR]: { ts: 30 } } } })],
      timeline,
    )

    expect(result).toBe(base)
  })

  it('принимает receipt на событие вне ленты, пока маркера нет (регидратация после F5)', () => {
    // initial sync после перезагрузки: маркер пуст, receipt может указывать старше окна истории
    const result = mergeReadReceipts(
      {},
      [readReceiptEvent({ $old: { 'm.read': { [OPERATOR]: { ts: 5 } } } })],
      timeline,
    )

    expect(result[OPERATOR]).toEqual({ eventId: '$old' })
  })

  it('игнорирует не-receipt ephemeral-события (m.typing и пр.)', () => {
    const typing: EphemeralEvent = {
      type: 'm.typing',
      content: { user_ids: [OPERATOR] },
    }

    expect(mergeReadReceipts({}, [typing], timeline)).toEqual({})
  })

  it('игнорирует receipt без m.read', () => {
    expect(mergeReadReceipts({}, [readReceiptEvent({ $m1: {} })], timeline)).toEqual({})
  })

  it('принимает forward-receipt на событие вне ленты, даже когда маркер уже стоит', () => {
    // оператор дочитал наше сообщение, которого в текущем окне ещё нет (пришло раньше события).
    // раньше такой receipt терялся (canMoveMarker блокировал), а m.receipt не переприсылается —
    // и «прочитано» так и не доезжало. Теперь маркер сохраняется и применится, когда событие догрузится.
    const base: Record<string, ReadReceipt> = { [OPERATOR]: { eventId: '$m1' } }

    const result = mergeReadReceipts(
      base,
      [readReceiptEvent({ $notYetInTimeline: { 'm.read': { [OPERATOR]: { ts: 40 } } } })],
      timeline,
    )

    expect(result[OPERATOR]).toEqual({ eventId: '$notYetInTimeline' })
  })
})

describe('canMoveMarker', () => {
  const timeline = [ownMsg('$a', 1), ownMsg('$b', 2), ownMsg('$c', 3)]

  it('не откатывает маркер назад при скролле вверх', () => {
    // клиент, проскроллив вверх, не «раз-читал» $c — POST на $a сервер всё равно отвергнет
    expect(canMoveMarker(timeline, '$c', '$a')).toBe(false)
  })

  it('двигает маркер вперёд', () => {
    expect(canMoveMarker(timeline, '$a', '$c')).toBe(true)
  })

  it('дедуплицирует повтор того же eventId', () => {
    expect(canMoveMarker(timeline, '$a', '$a')).toBe(false)
  })

  it('пропускает первый маркер (сравнивать не с чем)', () => {
    expect(canMoveMarker(timeline, null, '$a')).toBe(true)
  })

  it('не блокирует, если прежний маркер вымылся из ленты', () => {
    expect(canMoveMarker(timeline, '$gone', '$b')).toBe(true)
  })

  it('пропускает forward-receipt на событие, ещё не подгруженное в ленту', () => {
    // receipt пришёл раньше своего события (или своё сообщение ещё optimistic). m.receipt
    // edge-triggered — заблокировать значит потерять его навсегда. Сравнить порядок нельзя,
    // но сервер монотонен, а лента не обрезается → это движение вперёд, пропускаем.
    expect(canMoveMarker(timeline, '$a', '$notYetInTimeline')).toBe(true)
  })
})

describe('readOwnEventIds', () => {
  it('помечает свои сообщения прочитанными вплоть до позиции чужого receipt', () => {
    const timeline = [ownMsg('$a', 5), ownMsg('$b', 8), ownMsg('$c', 12)]
    // оператор прислал receipt только на $b → прочитаны $a и $b, но не более поздний $c
    const receipts = { [OPERATOR]: { eventId: '$b' } }

    expect([...readOwnEventIds(receipts, timeline, OWN)]).toEqual(['$a', '$b'])
  })

  it('упорядочивает по позиции в ленте, а не по ts (устойчиво к перекосу часов)', () => {
    // $late идёт позже $target по порядку доставки, но с МЕНЬШИМ ts
    const timeline = [ownMsg('$target', 100), ownMsg('$late', 50)]
    const receipts = { [OPERATOR]: { eventId: '$target' } }

    const read = readOwnEventIds(receipts, timeline, OWN)

    // receipt дочитал только до позиции $target; $late позже по порядку → не прочитан,
    // хотя его ts меньше — ts-модель ошибочно пометила бы его прочитанным
    expect(read.has('$target')).toBe(true)
    expect(read.has('$late')).toBe(false)
  })

  it('игнорирует собственный receipt клиента', () => {
    const timeline = [ownMsg('$a', 5)]
    const receipts = { [OWN]: { eventId: '$a' } }

    expect(readOwnEventIds(receipts, timeline, OWN).size).toBe(0)
  })

  it('игнорирует receipt на событие, которого нет в ленте (как matrix-js-sdk)', () => {
    const timeline = [ownMsg('$a', 40), ownMsg('$b', 50)]
    // событие receipt'а не подгружено → порядку доверять нельзя → ничего не помечаем
    const receipts = { [OPERATOR]: { eventId: '$missing' } }

    expect(readOwnEventIds(receipts, timeline, OWN).size).toBe(0)
  })

  it('не помечает optimistic-черновик (нет серверного eventId)', () => {
    const timeline = [ownMsg('optimistic:l1', 5), ownMsg('$a', 8)]
    const receipts = { [OPERATOR]: { eventId: '$a' } }

    const read = readOwnEventIds(receipts, timeline, OWN)

    expect(read.has('optimistic:l1')).toBe(false)
    expect(read.has('$a')).toBe(true)
  })
})

describe('countUnread', () => {
  it('считает чужие сообщения после собственного read-маркера', () => {
    const timeline = [opMsg('$1', 1), ownMsg('$2', 2), opMsg('$3', 3), opMsg('$4', 4)]
    // мы отчитались до $1 → непрочитаны $3 и $4 (своё $2 не в счёт)
    const receipts = { [OWN]: { eventId: '$1' } }

    expect(countUnread(receipts, timeline, OWN)).toBe(2)
  })

  it('не считает свои и системные сообщения', () => {
    const timeline = [opMsg('$1', 1), ownMsg('$2', 2), systemItem({ eventId: '$sys', ts: 3 })]
    const receipts = { [OWN]: { eventId: '$1' } }

    expect(countUnread(receipts, timeline, OWN)).toBe(0)
  })

  it('без маркера непрочитано всё чужое в окне (гость ещё ничего не подтверждал)', () => {
    const timeline = [opMsg('$1', 1), opMsg('$2', 2)]

    expect(countUnread({}, timeline, OWN)).toBe(2)
  })

  it('маркер старше подгруженного окна — непрочитано всё окно после него', () => {
    // после F5 initial sync мог вернуть маркер на событие за пределами последних ~50
    const timeline = [opMsg('$new1', 10), opMsg('$new2', 11)]
    const receipts = { [OWN]: { eventId: '$paged-out' } }

    expect(countUnread(receipts, timeline, OWN)).toBe(2)
  })
})

// Подгрузка истории вверх кладёт старые события ПЕРЕД маркером. Ни countUnread, ни canMoveMarker
// специального кода под это не имеют — инварианты держатся на позиции маркера, и рефакторинг
// (например, обрезка ленты) их легко сломает. Пиним.
describe('read-маркер переживает подгрузку истории вверх', () => {
  it('счётчик непрочитанных не растёт от старых чужих сообщений перед маркером', () => {
    const timeline = [opMsg('$1', 1), opMsg('$2', 2)]
    const receipts = { [OWN]: { eventId: '$1' } }
    const withHistory = [opMsg('$old1', -2), opMsg('$old2', -1), ...timeline]

    expect(countUnread(receipts, withHistory, OWN)).toBe(countUnread(receipts, timeline, OWN))
  })

  it('скан ленты после подгрузки не откатывает маркер на старое сообщение', () => {
    // пользователь стоит наверху, DOM-скан находит старое сообщение и зовёт markRead —
    // маркер обязан остаться там, где был
    const timeline = [opMsg('$old', -1), opMsg('$1', 1), opMsg('$2', 2)]

    expect(canMoveMarker(timeline, '$2', '$old')).toBe(false)
  })
})
