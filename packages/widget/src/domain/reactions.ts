import type { EventId, UserId } from '@/shared/types/ids'

/** Одно событие `m.reaction`: кто и чем отреагировал. */
export interface ReactionEntry {
  eventId: EventId
  sender: UserId
  key: string
}

/**
 * Реакции по id целевого сообщения — только то, что подтвердил сервер: события из `/sync` и
 * истории плюс ответы на свои запросы. Свой ещё не подтверждённый выбор сюда не пишется, он
 * лежит рядом (`PendingReactions`) и только накрывает индекс при показе. Поэтому откатывать
 * индекс не приходится никогда: в нём ровно то, что прошло.
 */
export type ReactionIndex = Record<EventId, ReactionEntry[]>

/**
 * Своя реакция, выбранная, но ещё не доведённая до сервера: ключ или null — снять.
 * Пока выбор есть, он заменяет свои реакции из индекса в том, что видит пользователь.
 */
export type PendingReactions = Record<EventId, string | null>

/**
 * Изменения реакций одной порции событий, в хронологическом порядке.
 *
 * Порядок операций сохраняем списком, а не двумя корзинами «добавили/сняли»: сервер дедуплицирует
 * реакции по `(target, sender, key)` и на повторную реакцию после снятия может вернуть прежний
 * `event_id` — при разложении по корзинам снятие затёрло бы заново поставленную реакцию.
 */
export type ReactionDelta = ReactionOp[]

export type ReactionOp =
  | { op: 'add'; targetEventId: EventId; entry: ReactionEntry }
  // редакция адресует событие реакции, а не сообщение, и цель из неё не восстановить
  | { op: 'remove'; eventId: EventId }

/** Свёртка реакций сообщения для UI: по одному чипу на эмодзи. */
export interface ReactionSummary {
  key: string
  // сколько участников отреагировали этим эмодзи
  count: number
  isOwn: boolean
}

const NO_SUMMARIES: ReactionSummary[] = []

/** Добавляет реакцию; уже известное событие (эхо ответа на свой запрос) не дублирует. */
export function addReaction(
  index: ReactionIndex,
  targetEventId: EventId,
  entry: ReactionEntry,
): ReactionIndex {
  const entries = index[targetEventId] ?? []
  if (entries.some((e) => e.eventId === entry.eventId)) return index

  return { ...index, [targetEventId]: [...entries, entry] }
}

/**
 * Убирает реакцию по id её события. Редакция называет только его, поэтому цель ищем перебором;
 * индекс мал — в нём живут лишь сообщения, на которые кто-то отреагировал. Опустевшая цель
 * из индекса удаляется целиком.
 */
export function removeReaction(index: ReactionIndex, eventId: EventId): ReactionIndex {
  for (const [targetEventId, entries] of Object.entries(index)) {
    const next = entries.filter((e) => e.eventId !== eventId)
    if (next.length === entries.length) continue

    if (next.length === 0) {
      const { [targetEventId]: _empty, ...rest } = index
      return rest
    }

    return { ...index, [targetEventId]: next }
  }

  return index
}

export function applyReactionDelta(index: ReactionIndex, delta: ReactionDelta): ReactionIndex {
  let result = index

  for (const op of delta) {
    result =
      op.op === 'add'
        ? addReaction(result, op.targetEventId, op.entry)
        : removeReaction(result, op.eventId)
  }

  return result
}

/**
 * Схлопывает реакции сообщения в чипы — это и есть то, что видит пользователь; по этой же свёртке
 * решается, ставить или снимать реакцию на нажатие.
 *
 * `pending` — свой выбор, ещё не доведённый до сервера (`PendingReactions`): пока он есть, свои
 * реакции берутся из него, а не из индекса.
 *
 * Считаем участников, а не события: сервер дедуплицирует по `(target, sender, key)` асинхронно,
 * и два быстрых запроса одного автора (например, из двух вкладок) могут оставить два события.
 * Порядок — по первому появлению ключа: чип не должен прыгать от того, что вторым участником
 * проставлена та же реакция.
 */
export function aggregateReactions(
  entries: ReactionEntry[] | undefined,
  ownUserId: UserId,
  pending?: string | null,
): ReactionSummary[] {
  const sendersByKey = new Map<string, Set<UserId>>()
  const addSender = (key: string, sender: UserId) => {
    const senders = sendersByKey.get(key) ?? new Set<UserId>()
    senders.add(sender)
    sendersByKey.set(key, senders)
  }

  for (const { key, sender } of entries ?? []) {
    if (pending !== undefined && sender === ownUserId) continue
    addSender(key, sender)
  }
  if (pending !== undefined && pending !== null) addSender(pending, ownUserId)

  if (sendersByKey.size === 0) return NO_SUMMARIES

  return [...sendersByKey].map(([key, senders]) => ({
    key,
    count: senders.size,
    isOwn: senders.has(ownUserId),
  }))
}
