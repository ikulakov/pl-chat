import { isOptimistic } from './optimistic'

/** Одно событие `m.reaction`: кто и чем отреагировал. */
export interface ReactionEntry {
  // id события реакции; до ответа сервера — placeholder `optimistic:{uuid}`
  eventId: string
  sender: string
  key: string
}

/** Реакции по id целевого сообщения. */
export type ReactionIndex = Record<string, ReactionEntry[]>

/**
 * Изменения реакций одной порции событий, в хронологическом порядке.
 *
 * Порядок операций сохраняем списком, а не двумя корзинами «добавили/сняли»: сервер дедуплицирует
 * реакции по `(target, sender, key)` и на повторную реакцию после снятия может вернуть прежний
 * `event_id` — при разложении по корзинам снятие затёрло бы заново поставленную реакцию.
 */
export type ReactionDelta = ReactionOp[]

export type ReactionOp =
  | { op: 'add'; targetEventId: string; entry: ReactionEntry }
  // редакция адресует событие реакции, а не сообщение, и цель из неё не восстановить
  | { op: 'remove'; eventId: string }

/** Свёртка реакций сообщения для UI: по одному чипу на эмодзи. */
export interface ReactionSummary {
  key: string
  count: number
  // id своей реакции с этим ключом — им же её и снимаем; null — своей нет
  ownEventId: string | null
}

const NO_SUMMARIES: ReactionSummary[] = []

/**
 * Добавляет реакцию, схлопывая её с уже известной от того же автора с тем же ключом.
 *
 * Это и есть дедуп оптимистичной записи с эхом из `/sync`: сервер дедуплицирует по
 * `(target, sender, key)`, значит пара таких записей всегда описывает одно событие, каким бы
 * ни был порядок прихода. Реальный `eventId` вытесняет оптимистичный, но не наоборот.
 */
export function addReaction(
  index: ReactionIndex,
  targetEventId: string,
  entry: ReactionEntry,
): ReactionIndex {
  const entries = index[targetEventId] ?? []
  const sameIndex = entries.findIndex((e) => e.sender === entry.sender && e.key === entry.key)

  if (sameIndex === -1) {
    return { ...index, [targetEventId]: [...entries, entry] }
  }

  const existing = entries[sameIndex]!
  if (existing.eventId === entry.eventId) return index
  if (isOptimistic(entry.eventId) && !isOptimistic(existing.eventId)) return index

  const next = [...entries]
  next[sameIndex] = entry

  return { ...index, [targetEventId]: next }
}

/** Проставляет оптимистичной записи реальный `eventId` из ответа на отправку. */
export function confirmReaction(
  index: ReactionIndex,
  targetEventId: string,
  localEventId: string,
  eventId: string,
): ReactionIndex {
  const entries = index[targetEventId]
  const localIndex = entries?.findIndex((e) => e.eventId === localEventId) ?? -1
  // эхо из /sync могло опередить ответ на PUT и уже подменить запись — подтверждать нечего
  if (!entries || localIndex === -1) return index

  const next = [...entries]
  next[localIndex] = { ...entries[localIndex]!, eventId }

  return { ...index, [targetEventId]: next }
}

/** Убирает реакцию у известной цели. Пустая цель из индекса удаляется целиком. */
export function removeReaction(
  index: ReactionIndex,
  targetEventId: string,
  eventId: string,
): ReactionIndex {
  const entries = index[targetEventId]
  if (!entries) return index

  const next = entries.filter((e) => e.eventId !== eventId)
  if (next.length === entries.length) return index

  if (next.length === 0) {
    const { [targetEventId]: _empty, ...rest } = index
    return rest
  }

  return { ...index, [targetEventId]: next }
}

export function applyReactionDelta(index: ReactionIndex, delta: ReactionDelta): ReactionIndex {
  let result = index

  for (const op of delta) {
    result =
      op.op === 'add'
        ? addReaction(result, op.targetEventId, op.entry)
        : removeAnywhere(result, op.eventId)
  }

  return result
}

// Редакция называет только id снимаемой реакции, поэтому цель ищем перебором. Индекс мал:
// в нём живут лишь сообщения, на которые кто-то отреагировал.
function removeAnywhere(index: ReactionIndex, eventId: string): ReactionIndex {
  for (const targetEventId of Object.keys(index)) {
    const next = removeReaction(index, targetEventId, eventId)
    if (next !== index) return next
  }

  return index
}

export function findOwnReaction(
  index: ReactionIndex,
  targetEventId: string,
  ownUserId: string,
  key: string,
): ReactionEntry | undefined {
  return index[targetEventId]?.find((e) => e.sender === ownUserId && e.key === key)
}

/**
 * Схлопывает реакции сообщения в чипы. Порядок — по первому появлению ключа: чип не должен
 * прыгать от того, что вторым участником проставлена та же реакция.
 */
export function aggregateReactions(
  entries: ReactionEntry[] | undefined,
  ownUserId: string,
): ReactionSummary[] {
  if (!entries || entries.length === 0) return NO_SUMMARIES

  const byKey = new Map<string, ReactionSummary>()

  for (const { key, sender, eventId } of entries) {
    const summary = byKey.get(key)

    if (!summary) {
      byKey.set(key, { key, count: 1, ownEventId: sender === ownUserId ? eventId : null })
      continue
    }

    summary.count += 1
    if (sender === ownUserId) summary.ownEventId = eventId
  }

  return [...byKey.values()]
}
