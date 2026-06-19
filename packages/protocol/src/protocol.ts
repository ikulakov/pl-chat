/**
 * Контракт сообщений host ↔ iframe.
 */

// Стартовый конфиг, который хост передаёт виджету командой INIT.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface InitConfig {}

// ─────────────────────────────────────────────────────────────────────────────
// Команды: хост → iframe
// ─────────────────────────────────────────────────────────────────────────────
export type HostCommand =
  | { type: 'INIT'; payload: InitConfig }
  | { type: 'OPEN' }
  | { type: 'CLOSE' }
  | { type: 'TOGGLE' }

export type HostCommandType = HostCommand['type']

// ─────────────────────────────────────────────────────────────────────────────
// События: iframe → хост
// ─────────────────────────────────────────────────────────────────────────────
export type ChatEvent =
  | { type: 'READY' }
  | { type: 'INIT_ACK' }
  | { type: 'OPENED' }
  | { type: 'CLOSED' }

export type ChatEventType = ChatEvent['type']

export const HOST_COMMAND_TYPES = [
  'INIT',
  'OPEN',
  'CLOSE',
  'TOGGLE',
] as const satisfies readonly HostCommandType[]

export const CHAT_EVENT_TYPES = [
  'READY',
  'INIT_ACK',
  'OPENED',
  'CLOSED',
] as const satisfies readonly ChatEventType[]

export const HOST_COMMAND_TYPE_SET: ReadonlySet<HostCommandType> = new Set(HOST_COMMAND_TYPES)
export const CHAT_EVENT_TYPE_SET: ReadonlySet<ChatEventType> = new Set(CHAT_EVENT_TYPES)

export function isHostCommand(msg: Record<string, unknown>): msg is HostCommand {
  return (
    typeof msg['type'] === 'string' && HOST_COMMAND_TYPE_SET.has(msg['type'] as HostCommandType)
  )
}

export function isChatEvent(msg: Record<string, unknown>): msg is ChatEvent {
  return typeof msg['type'] === 'string' && CHAT_EVENT_TYPE_SET.has(msg['type'] as ChatEventType)
}

export type PayloadOf<E extends ChatEventType> =
  Extract<ChatEvent, { type: E }> extends { payload: infer P } ? P : undefined
