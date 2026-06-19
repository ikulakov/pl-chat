/** Маркер, отличающий наш postMessage-трафик от любого другого (аналитика, расширения, другие виджеты). */
const NAMESPACE = '__plchat' as const

interface Envelope<T = unknown> {
  ns: typeof NAMESPACE
  id: string
  ts: number
  msg: T
}

/** PostMessage wrapper, в который заворачивается каждое сообщение в обе стороны. */
export function makeEnvelope<T>(msg: T): Envelope<T> {
  return {
    ns: NAMESPACE,
    id: crypto.randomUUID(),
    ts: Date.now(),
    msg,
  }
}

export function isEnvelope(data: unknown): data is Envelope<Record<string, unknown>> {
  if (typeof data !== 'object' || data === null) return false
  const e = data as Partial<Envelope>
  return (
    e.ns === NAMESPACE &&
    typeof e.id === 'string' &&
    typeof e.ts === 'number' &&
    typeof e.msg === 'object' &&
    e.msg !== null
  )
}
